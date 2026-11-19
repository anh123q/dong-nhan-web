import { NextResponse } from "next/server";
import {
  callGeminiText,
  describeGeminiError,
  hasGeminiKey,
} from "@/lib/gemini";
import { retrieveVector } from "@/lib/rag";
import type {
  AiContinueResult,
  BibleEntry,
  RetrievedChunk,
  RetrievalMode,
} from "@/lib/types";

/**
 * POST /api/ai/continue — viết tiếp chương đang dở (AI #3 theo thứ tự
 * ưu tiên của user: kiểm tra mâu thuẫn → gợi ý → viết tiếp).
 *
 * Body:
 * {
 *   "storyId": string,
 *   "chapterId": string,
 *   "storyTitle": string,
 *   "originalWork": string,
 *   "chapterTitle": string,
 *   "chapterNumber": number,
 *   "chapterContent": string,   // BẮT BUỘC: đoạn đã viết để nối tiếp
 *   "direction": string,         // hướng viết do user chọn/ghi (tùy chọn)
 *   "targetWords": number,       // độ dài mong muốn, mặc định ~600 (200-1500)
 *   "bible": BibleEntry[],
 *   "previousSummaries": [{ number, title, summary }],
 *   "arcSummary": string,
 *   "retrievedContext": RetrievedChunk[]  // chế độ local: client gửi kèm
 * }
 *
 * Trả về: { continuation, model, generatedAt, retrieval: { mode, count } }
 * Đoạn viết tiếp chỉ là bản nháp — client chèn vào cuối chương khi user
 * đồng ý, không tự ghi đè nội dung. AI phải giữ đúng giọng văn, tên,
 * sức mạnh và timeline đã có; không tự giải quyết plot thread đang mở
 * trừ khi direction yêu cầu.
 * Chưa có GEMINI_API_KEY thì trả 503, không crash.
 */

interface ContinueRequest {
  storyId?: string;
  chapterId?: string;
  storyTitle?: string;
  originalWork?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  chapterContent?: string;
  direction?: string;
  targetWords?: number;
  bible?: BibleEntry[];
  previousSummaries?: Array<{
    number: number;
    title: string;
    summary: string;
  }>;
  arcSummary?: string;
  retrievedContext?: RetrievedChunk[];
}

const MAX_CONTENT_CHARS = 20_000;
const MAX_BIBLE_CHARS = 12_000;
const MAX_CHUNK_CHARS = 3_000;
const MAX_RETRIEVED_CHARS = 12_000;

function buildPrompt(req: ContinueRequest, retrieved: RetrievedChunk[]): string {
  const bibleText = (req.bible ?? [])
    .map((b) => `- [${b.type}] ${b.title}: ${b.content}`)
    .join("\n");
  const summariesText = (req.previousSummaries ?? [])
    .map((s) => `- Chương ${s.number} "${s.title}": ${s.summary}`)
    .join("\n");
  const retrievedText = retrieved
    .map((r) => `--- [${r.label}] ---\n${r.text.slice(0, MAX_CHUNK_CHARS)}`)
    .join("\n\n");
  const targetWords = Math.min(
    Math.max(req.targetWords ?? 600, 200),
    1500
  );

  return `Bạn là tác giả viết tiếp truyện đồng nhân (fanfiction) bằng tiếng Việt, nối tiếp đúng đoạn văn user đã viết.

Truyện: "${req.storyTitle ?? ""}" — đồng nhân của nguyên tác "${req.originalWork ?? ""}".
Chương ${req.chapterNumber ?? "?"} "${req.chapterTitle ?? ""}".

## STORY BIBLE (luật bắt buộc — nhân vật, quy tắc thế giới, timeline)
${bibleText || "(chưa có mục nào)"}

## TÓM TẮT ARC TỔNG THỂ
${req.arcSummary?.trim() || "(chưa có)"}

## TÓM TẮT CÁC CHƯƠNG TRƯỚC
${summariesText || "(chưa có chương trước)"}

## ĐOẠN LIÊN QUAN NHẤT (RAG — canon, chương trước, Bible)
${retrievedText || "(không tìm thấy đoạn liên quan)"}

## HƯỚNG VIẾT USER CHỌN (nếu có — tuân thủ hướng này)
${req.direction?.trim() || "(không có — hãy viết tiếp tự nhiên theo mạch truyện)"}

## ĐOẠN ĐÃ VIẾT — VIẾT TIẾP NGAY SAU ĐOẠN NÀY, KHÔNG VIẾT LẠI
${(req.chapterContent ?? "").slice(-MAX_CONTENT_CHARS)}

## YÊU CẦU
- Viết tiếp khoảng ${targetWords} từ bằng tiếng Việt, cùng giọng văn và nhịp kể với đoạn đã viết.
- Giữ đúng tên nhân vật, ngoại hình, sức mạnh/cấp bậc, quan hệ và timeline trong Bible và các chương trước. Không bịa thêm nhân vật, vật phẩm hay quy tắc mới trừ khi hướng viết yêu cầu.
- Không lặp lại đoạn cuối đã viết, không tóm tắt lại những gì vừa xảy ra.
- Không tự giải quyết dứt điểm plot thread đang mở, trừ khi hướng viết yêu cầu rõ.
- Kết thúc ở một điểm dừng tự nhiên (hết cảnh hoặc hết đoạn hội thoại), không dừng giữa câu.
- Chỉ trả về nội dung viết tiếp, không thêm lời giải thích, tiêu đề hay ghi chú nào khác.`;
}

export async function POST(request: Request) {
  try {
    if (!hasGeminiKey()) {
      return NextResponse.json(
        {
          error:
            "Chưa cấu hình GEMINI_API_KEY. Hãy tạo key miễn phí tại Google AI Studio (https://aistudio.google.com/apikey) rồi thêm vào file .env.local và khởi động lại server.",
        },
        { status: 503 }
      );
    }

    const body = (await request.json()) as ContinueRequest;
    const content = (body.chapterContent ?? "").trim();
    if (!content) {
      return NextResponse.json(
        {
          error:
            "Chương chưa có nội dung để viết tiếp. Hãy viết vài câu mở đầu trước, hoặc dùng tính năng gợi ý cốt truyện để chọn hướng rồi viết.",
        },
        { status: 400 }
      );
    }

    const bible = (body.bible ?? []).slice(0, 50);
    let bibleChars = 0;
    const trimmedBible = bible.filter((b) => {
      bibleChars += b.title.length + b.content.length;
      return bibleChars <= MAX_BIBLE_CHARS;
    });

    // --- Retrieval: vector trước, keyword (client gửi kèm) sau ---
    let retrieved: RetrievedChunk[] = [];
    let mode: RetrievalMode = "none";
    if (body.storyId) {
      const queryText = `${body.chapterTitle ?? ""}\n${body.direction ?? ""}\n${content.slice(-2000)}`;
      retrieved = await retrieveVector({
        storyId: body.storyId,
        queryText,
        excludeSourceId: body.chapterId,
        topK: 8,
      });
      if (retrieved.length > 0) mode = "vector";
    }
    if (retrieved.length === 0 && (body.retrievedContext?.length ?? 0) > 0) {
      retrieved = body.retrievedContext as RetrievedChunk[];
      mode = "keyword";
    }
    let totalChars = 0;
    retrieved = retrieved.filter((r) => {
      totalChars += r.text.length;
      return totalChars <= MAX_RETRIEVED_CHARS;
    });

    const targetWords = Math.min(
      Math.max(body.targetWords ?? 600, 200),
      1500
    );
    const { text, model } = await callGeminiText(
      buildPrompt({ ...body, bible: trimmedBible }, retrieved),
      {
        temperature: 0.8,
        // ~1.5 token/từ tiếng Việt + dự phòng cho đoạn dài.
        maxOutputTokens: Math.min(Math.max(targetWords * 2, 1024), 8192),
      }
    );

    const result: AiContinueResult = {
      continuation: text.trim(),
      model,
      generatedAt: new Date().toISOString(),
      retrieval: { mode, count: retrieved.length },
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/ai/continue]", err);
    return NextResponse.json(
      { error: `Viết tiếp thất bại: ${describeGeminiError(err)}` },
      { status: 500 }
    );
  }
}
