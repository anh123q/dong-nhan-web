import { NextResponse } from "next/server";
import {
  callGeminiJson,
  describeGeminiError,
  hasGeminiKey,
  parseGeminiJson,
} from "@/lib/gemini";
import { retrieveVector } from "@/lib/rag";
import type {
  AiCheckResult,
  BibleEntry,
  Contradiction,
  RetrievedChunk,
  RetrievalMode,
} from "@/lib/types";

/**
 * POST /api/ai/check — kiểm tra mâu thuẫn của 1 chương (RAG thật).
 *
 * Body:
 * {
 *   "storyId": string,                        // để server truy xuất vector
 *   "chapterId": string,                      // để loại chunk của chính chương này
 *   "storyTitle": string,
 *   "originalWork": string,
 *   "chapterTitle": string,
 *   "chapterNumber": number,
 *   "chapterContent": string,
 *   "bible": BibleEntry[],                    // Story Bible = "luật"
 *   "previousSummaries": [{ number, title, summary }],  // tóm tắt chương trước
 *   "arcSummary": string,                     // tóm tắt arc tổng thể (nếu có)
 *   "retrievedContext": RetrievedChunk[]      // client gửi kèm khi ở chế độ
 *                                             // local (tìm theo từ khóa)
 * }
 *
 * Trả về: { contradictions, model, checkedAt, retrieval: { mode, count } }
 * Chưa có GEMINI_API_KEY thì trả 503 với thông báo rõ ràng, không crash.
 *
 * Retrieval 3 tầng, ưu tiên từ cao xuống thấp:
 * 1. vector (pgvector, khi đã nối Supabase): server tự embed chương đang
 *    kiểm tra rồi tìm top chunk liên quan nhất trong canon + chương trước
 *    + Bible qua RPC match_embeddings.
 * 2. keyword (chế độ local, chưa có Supabase): client đã xếp hạng chunk
 *    theo từ khóa và gửi kèm top 8 trong retrievedContext.
 * 3. none: không có đoạn nào — vẫn kiểm tra bằng Bible + tóm tắt.
 * Retrieval lỗi không làm hỏng lần kiểm tra: tự tụt xuống tầng dưới.
 */

interface CheckRequest {
  storyId?: string;
  chapterId?: string;
  storyTitle?: string;
  originalWork?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  chapterContent?: string;
  bible?: BibleEntry[];
  previousSummaries?: Array<{
    number: number;
    title: string;
    summary: string;
  }>;
  arcSummary?: string;
  retrievedContext?: RetrievedChunk[];
}

const MAX_CONTENT_CHARS = 60_000;
const MAX_BIBLE_CHARS = 20_000;
const MAX_CHUNK_CHARS = 3_000;
const MAX_RETRIEVED_CHARS = 18_000;

function buildPrompt(
  req: CheckRequest,
  retrieved: RetrievedChunk[]
): string {
  const bibleText = (req.bible ?? [])
    .map((b) => `- [${b.type}] ${b.title}: ${b.content}`)
    .join("\n");
  const summariesText = (req.previousSummaries ?? [])
    .map((s) => `- Chương ${s.number} "${s.title}": ${s.summary}`)
    .join("\n");
  const retrievedText = retrieved
    .map(
      (r) =>
        `--- [${r.label}] ---\n${r.text.slice(0, MAX_CHUNK_CHARS)}`
    )
    .join("\n\n");

  return `Bạn là biên tập viên chuyên kiểm tra tính nhất quán cho truyện đồng nhân (fanfiction).

Truyện: "${req.storyTitle ?? ""}" — đồng nhân của nguyên tác "${req.originalWork ?? ""}".
Chương cần kiểm tra: chương ${req.chapterNumber ?? "?"} "${req.chapterTitle ?? ""}".

## STORY BIBLE (luật bắt buộc, ưu tiên cao nhất — nhân vật, quy tắc thế giới, timeline, plot thread)
${bibleText || "(chưa có mục nào)"}

## TÓM TẮT ARC TỔNG THỂ
${req.arcSummary?.trim() || "(chưa có)"}

## TÓM TẮT CÁC CHƯƠNG TRƯỚC (theo thứ tự)
${summariesText || "(chưa có chương trước)"}

## ĐOẠN LIÊN QUAN NHẤT (RAG — trích từ nguyên tác canon, các chương trước và Bible; mỗi đoạn có nhãn nguồn)
${retrievedText || "(không tìm thấy đoạn liên quan)"}

## NỘI DUNG CHƯƠNG CẦN KIỂM TRA
${(req.chapterContent ?? "").slice(0, MAX_CONTENT_CHARS)}

## NHIỆM VỤ
Tìm mọi mâu thuẫn giữa chương này với Story Bible, nguyên tác canon và các chương trước, thuộc các loại:
- Nhân vật: tính cách, ngoại hình, tuổi, quan hệ, khả năng thay đổi vô lý
- Cốt truyện: sự kiện, địa điểm, thời gian mâu thuẫn với chương trước
- Thế giới: vi phạm quy tắc đã ghi trong Bible (sức mạnh, cấp bậc, luật lệ)
- Nguyên tác: lệch với canon (chỉ báo khi rõ ràng là vô tình lệch, không phải sáng tạo có chủ ý)
- Logic: nhân vật biết điều chưa từng được biết, vật phẩm xuất hiện/biến mất vô lý

QUY TẮC BẰNG CHỨNG (BẮT BUỘC): mỗi mâu thuẫn phải ghi rõ bằng chứng gồm (1) trích đoạn trong chương này và (2) nhãn nguồn đối chiếu, vd "Chương 3 — Lựa chọn (đoạn 2)", "Canon: Quyển 1 (đoạn 5)" hoặc "Bible: Quy tắc hồn hoàn". KHÔNG được báo mâu thuẫn mà không nêu được nguồn đối chiếu cụ thể.
CHỈ báo những mâu thuẫn có căn cứ rõ ràng. Không bịa mâu thuẫn. Nếu chương nhất quán, trả về mảng rỗng.
Trả về JSON đúng định dạng sau, không thêm chữ nào khác:
{
  "contradictions": [
    {
      "severity": "cao" | "trung-binh" | "thap",
      "category": "Nhân vật" | "Cốt truyện" | "Thế giới" | "Nguyên tác" | "Logic",
      "description": "Mô tả mâu thuẫn bằng tiếng Việt",
      "evidence": "Bằng chứng: trích đoạn trong chương này + nhãn nguồn đối chiếu (chương/canon/Bible)",
      "suggestion": "Gợi ý sửa cụ thể"
    }
  ]
}`;
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

    const body = (await request.json()) as CheckRequest;
    const content = (body.chapterContent ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "Chương chưa có nội dung để kiểm tra." },
        { status: 400 }
      );
    }

    // Giới hạn độ dài Bible để prompt không quá dài.
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
      const queryText = `${body.chapterTitle ?? ""}\n${content.slice(0, 2000)}`;
      retrieved = await retrieveVector({
        storyId: body.storyId,
        queryText,
        excludeSourceId: body.chapterId,
        topK: 10,
      });
      if (retrieved.length > 0) mode = "vector";
    }
    if (retrieved.length === 0 && (body.retrievedContext?.length ?? 0) > 0) {
      retrieved = body.retrievedContext as RetrievedChunk[];
      mode = "keyword";
    }
    // Giới hạn tổng độ dài đoạn trích để prompt không quá dài.
    let totalChars = 0;
    retrieved = retrieved.filter((r) => {
      totalChars += r.text.length;
      return totalChars <= MAX_RETRIEVED_CHARS;
    });

    const { text, model } = await callGeminiJson(
      buildPrompt({ ...body, bible: trimmedBible }, retrieved),
      { temperature: 0.3 }
    );

    const parsed = parseGeminiJson<{ contradictions?: Contradiction[] }>(text);
    const contradictions = Array.isArray(parsed.contradictions)
      ? parsed.contradictions
      : [];

    const result: AiCheckResult = {
      contradictions,
      model,
      checkedAt: new Date().toISOString(),
      retrieval: { mode, count: retrieved.length },
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/ai/check]", err);
    return NextResponse.json(
      { error: `Kiểm tra mâu thuẫn thất bại: ${describeGeminiError(err)}` },
      { status: 500 }
    );
  }
}
