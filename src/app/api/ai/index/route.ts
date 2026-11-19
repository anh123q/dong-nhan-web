import { NextResponse } from "next/server";
import { describeGeminiError, hasGeminiKey } from "@/lib/gemini";
import {
  deleteEmbeddingsForSource,
  indexSource,
  type IndexSourceType,
} from "@/lib/rag";

/**
 * POST /api/ai/index — lập chỉ mục 1 nguồn cho RAG: cắt chunk, tạo
 * embedding, lưu vào bảng embeddings (pgvector).
 *
 * Body:
 * {
 *   "storyId": string,
 *   "sourceType": "canon" | "chapter" | "bible",
 *   "sourceId": string,
 *   "title": string,
 *   "content": string
 * }
 *
 * Trả về: { indexed, mode, chunks, truncated }
 * - Chưa nối Supabase → { indexed: false, mode: "local" } (không lỗi,
 *   client sẽ dùng tìm kiếm từ khóa thay thế).
 * - Chưa có GEMINI_API_KEY → 503 với thông báo rõ ràng.
 *
 * DELETE /api/ai/index?sourceType=canon&sourceId=... — xóa vector của
 * 1 nguồn (gọi khi user xóa chương / nguồn canon / mục Bible).
 */

const VALID_SOURCE_TYPES: IndexSourceType[] = ["canon", "chapter", "bible"];

interface IndexRequest {
  storyId?: string;
  sourceType?: string;
  sourceId?: string;
  title?: string;
  content?: string;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as IndexRequest;
    if (
      !body.storyId ||
      !body.sourceId ||
      !VALID_SOURCE_TYPES.includes(body.sourceType as IndexSourceType)
    ) {
      return NextResponse.json(
        { error: "Thiếu storyId, sourceId hoặc sourceType không hợp lệ." },
        { status: 400 }
      );
    }
    const content = (body.content ?? "").trim();
    if (!content) {
      return NextResponse.json(
        { error: "Nội dung trống, không lập chỉ mục được." },
        { status: 400 }
      );
    }
    if (!hasGeminiKey()) {
      return NextResponse.json(
        {
          error:
            "Chưa cấu hình GEMINI_API_KEY. Hãy tạo key miễn phí tại Google AI Studio (https://aistudio.google.com/apikey) rồi thêm vào file .env.local và khởi động lại server.",
        },
        { status: 503 }
      );
    }

    const result = await indexSource({
      storyId: body.storyId,
      sourceType: body.sourceType as IndexSourceType,
      sourceId: body.sourceId,
      title: body.title ?? "",
      content,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/ai/index]", err);
    return NextResponse.json(
      { error: `Lập chỉ mục thất bại: ${describeGeminiError(err)}` },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const sourceType = url.searchParams.get("sourceType") ?? "";
    const sourceId = url.searchParams.get("sourceId") ?? "";
    if (
      !VALID_SOURCE_TYPES.includes(sourceType as IndexSourceType) ||
      !sourceId
    ) {
      return NextResponse.json(
        { error: "Thiếu sourceType hoặc sourceId." },
        { status: 400 }
      );
    }
    await deleteEmbeddingsForSource(
      sourceType as IndexSourceType,
      sourceId
    );
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("[api/ai/index] DELETE", err);
    return NextResponse.json(
      { error: `Xóa vector thất bại: ${err instanceof Error ? err.message : "Lỗi không xác định"}` },
      { status: 500 }
    );
  }
}
