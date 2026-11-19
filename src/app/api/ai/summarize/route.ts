import { NextResponse } from "next/server";
import { describeGeminiError, hasGeminiKey } from "@/lib/gemini";
import {
  summarizeChapterStructured,
  updateArcSummary,
} from "@/lib/summarize";

/**
 * POST /api/ai/summarize — tạo tóm tắt có cấu trúc cho 1 chương vừa
 * xuất bản, đồng thời cập nhật tóm tắt arc tổng thể của truyện.
 *
 * Body:
 * {
 *   "storyId": string,
 *   "chapterNumber": number,
 *   "chapterTitle": string,
 *   "chapterContent": string,
 *   "previousArcSummary": string | null   // tóm tắt arc hiện tại (nếu có)
 * }
 *
 * Trả về: { summary: StructuredSummary, arcSummary: string, model }
 * Client tự lưu summary vào chapter_summaries + Chapter.summary
 * (oneLine) và arcSummary vào story_summaries — server không giữ state
 * nên chạy được cả ở chế độ local (chưa nối Supabase).
 *
 * Chưa có GEMINI_API_KEY thì trả 503 với thông báo rõ ràng, không crash.
 * Dùng model nhẹ (bulk) để tiết kiệm quota vì việc này chạy thường xuyên.
 */

interface SummarizeRequest {
  storyId?: string;
  chapterNumber?: number;
  chapterTitle?: string;
  chapterContent?: string;
  previousArcSummary?: string | null;
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

    const body = (await request.json()) as SummarizeRequest;
    const content = (body.chapterContent ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "Chương chưa có nội dung để tóm tắt." },
        { status: 400 }
      );
    }

    const number = body.chapterNumber ?? 0;
    const title = body.chapterTitle ?? "";
    const { summary, model } = await summarizeChapterStructured(
      number,
      title,
      content
    );
    const { arcSummary } = await updateArcSummary(
      body.previousArcSummary ?? null,
      summary,
      number,
      title
    );

    return NextResponse.json({ summary, arcSummary, model });
  } catch (err) {
    console.error("[api/ai/summarize]", err);
    return NextResponse.json(
      { error: `Tóm tắt chương thất bại: ${describeGeminiError(err)}` },
      { status: 500 }
    );
  }
}
