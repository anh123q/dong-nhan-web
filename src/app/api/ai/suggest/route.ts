import { NextResponse } from "next/server";
import {
  callGeminiJson,
  describeGeminiError,
  hasGeminiKey,
  parseGeminiJson,
} from "@/lib/gemini";
import { retrieveVector } from "@/lib/rag";
import type {
  BibleEntry,
  PlotSuggestion,
  AiSuggestResult,
  RetrievedChunk,
  RetrievalMode,
} from "@/lib/types";

/**
 * POST /api/ai/suggest — gợi ý hướng phát triển cốt truyện (AI #2 theo
 * thứ tự ưu tiên của user: kiểm tra mâu thuẫn → gợi ý → viết tiếp).
 *
 * Body (giống /api/ai/check, nhưng chương hiện tại có thể còn trống —
 * gợi ý viết chương tiếp theo dựa trên Bible + tóm tắt + RAG):
 * {
 *   "storyId": string,
 *   "chapterId": string,
 *   "storyTitle": string,
 *   "originalWork": string,
 *   "chapterTitle": string,
 *   "chapterNumber": number,
 *   "chapterContent": string,   // bản nháp chương đang viết (có thể rỗng)
 *   "bible": BibleEntry[],
 *   "previousSummaries": [{ number, title, summary }],
 *   "arcSummary": string,
 *   "retrievedContext": RetrievedChunk[],  // chế độ local: client gửi kèm
 *   "count": number                         // số gợi ý, mặc định 3 (1-5)
 * }
 *
 * Trả về: { suggestions, model, generatedAt, retrieval: { mode, count } }
 * Mỗi gợi ý nêu rõ: tiếp nối plot thread nào, vì sao hợp với Bible/canon,
 * và rủi ro mâu thuẫn cần tránh — để user chọn hướng trước khi bấm viết tiếp.
 * Chưa có GEMINI_API_KEY thì trả 503, không crash.
 */

interface SuggestRequest {
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
  count?: number;
}

const MAX_CONTENT_CHARS = 20_000;
const MAX_BIBLE_CHARS = 20_000;
const MAX_CHUNK_CHARS = 3_000;
const MAX_RETRIEVED_CHARS = 18_000;

function buildPrompt(req: SuggestRequest, retrieved: RetrievedChunk[]): string {
  const bibleText = (req.bible ?? [])
    .map((b) => `- [${b.type}] ${b.title}: ${b.content}`)
    .join("\n");
  const summariesText = (req.previousSummaries ?? [])
    .map((s) => `- Chương ${s.number} "${s.title}": ${s.summary}`)
    .join("\n");
  const retrievedText = retrieved
    .map((r) => `--- [${r.label}] ---\n${r.text.slice(0, MAX_CHUNK_CHARS)}`)
    .join("\n\n");
  const count = Math.min(Math.max(req.count ?? 3, 1), 5);

  return `Bạn là biên tập viên đồng hành cùng tác giả truyện đồng nhân (fanfiction), chuyên gợi ý hướng phát triển cốt truyện.

Truyện: "${req.storyTitle ?? ""}" — đồng nhân của nguyên tác "${req.originalWork ?? ""}".
Chương đang viết: chương ${req.chapterNumber ?? "?"} "${req.chapterTitle ?? ""}".

## STORY BIBLE (luật bắt buộc — nhân vật, quy tắc thế giới, timeline, plot thread đang mở)
${bibleText || "(chưa có mục nào)"}

## TÓM TẮT ARC TỔNG THỂ
${req.arcSummary?.trim() || "(chưa có)"}

## TÓM TẮT CÁC CHƯƠNG TRƯỚC (theo thứ tự)
${summariesText || "(chưa có chương trước)"}

## ĐOẠN LIÊN QUAN NHẤT (RAG — trích từ nguyên tác canon, các chương trước và Bible)
${retrievedText || "(không tìm thấy đoạn liên quan)"}

## BẢN NHÁP CHƯƠNG ĐANG VIẾT (nếu có)
${(req.chapterContent ?? "").trim().slice(0, MAX_CONTENT_CHARS) || "(chưa viết gì — gợi ý hướng cho chương tiếp theo)"}

## NHIỆM VỤ
Đề xuất đúng ${count} hướng phát triển cốt truyện KHÁC NHAU cho chương tiếp theo, mỗi hướng đều:
- Tiếp nối ít nhất 1 plot thread đang mở trong Bible/tóm tắt, hoặc mở 1 thread mới hợp lý từ những gì đã gieo.
- Tôn trọng Story Bible và nguyên tác canon: không đổi tính cách, sức mạnh, quan hệ hay timeline vô lý.
- Phân biệt rõ đâu là chi tiết theo canon, đâu là sáng tạo mới của fanfic.
- Đa dạng: ít nhất 1 hướng thiên về hành động/xung đột, 1 hướng thiên về nhân vật/cảm xúc (trừ khi truyện chỉ có 1 hướng thì ghi rõ).
- Mỗi hướng kèm 1 rủi ro mâu thuẫn cần tránh khi viết theo hướng đó.

Trả về JSON đúng định dạng sau, không thêm chữ nào khác:
{
  "suggestions": [
    {
      "title": "Tên ngắn gọn của hướng phát triển, bằng tiếng Việt",
      "summary": "Diễn biến gợi ý trong 3-5 câu: chuyện gì xảy ra, ai làm gì, kết quả ra sao",
      "continuesThread": "Plot thread đang mở nào được tiếp nối (ghi đúng tên trong Bible/tóm tắt, hoặc 'Mở thread mới: ...')",
      "whyItFits": "Vì sao hướng này hợp với Bible/canon/chương trước (1-2 câu, nêu căn cứ cụ thể)",
      "risk": "Rủi ro mâu thuẫn cần tránh khi viết theo hướng này (1 câu)"
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

    const body = (await request.json()) as SuggestRequest;

    // Giới hạn độ dài Bible để prompt không quá dài.
    const bible = (body.bible ?? []).slice(0, 50);
    let bibleChars = 0;
    const trimmedBible = bible.filter((b) => {
      bibleChars += b.title.length + b.content.length;
      return bibleChars <= MAX_BIBLE_CHARS;
    });

    // --- Retrieval: vector trước, keyword (client gửi kèm) sau ---
    // Truy vấn là bản nháp + tóm tắt arc để tìm đoạn liên quan tới hướng đi tiếp.
    let retrieved: RetrievedChunk[] = [];
    let mode: RetrievalMode = "none";
    if (body.storyId) {
      const queryText = [
        body.chapterTitle ?? "",
        (body.chapterContent ?? "").slice(0, 2000),
        body.arcSummary ?? "",
      ]
        .join("\n")
        .trim();
      if (queryText) {
        retrieved = await retrieveVector({
          storyId: body.storyId,
          queryText,
          excludeSourceId: body.chapterId,
          topK: 10,
        });
        if (retrieved.length > 0) mode = "vector";
      }
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

    const { text, model } = await callGeminiJson(
      buildPrompt({ ...body, bible: trimmedBible }, retrieved),
      { temperature: 0.7 }
    );

    const parsed = parseGeminiJson<{ suggestions?: PlotSuggestion[] }>(text);
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions
          .filter((s) => s && typeof s.title === "string" && s.title.trim())
          .slice(0, 5)
      : [];

    const result: AiSuggestResult = {
      suggestions,
      model,
      generatedAt: new Date().toISOString(),
      retrieval: { mode, count: retrieved.length },
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/ai/suggest]", err);
    return NextResponse.json(
      { error: `Gợi ý cốt truyện thất bại: ${describeGeminiError(err)}` },
      { status: 500 }
    );
  }
}
