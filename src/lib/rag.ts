// RAG phía server: lập chỉ mục (chunk + embed + lưu pgvector) và
// truy xuất đoạn liên quan nhất cho AI kiểm tra mâu thuẫn.
// Chỉ chạy khi đã nối Supabase; chưa có Supabase thì các hàm trả về
// "không lập chỉ mục được" và phía client dùng tìm kiếm từ khóa thay thế
// (xem lib/chunks.ts) — web không crash trong cả 2 chế độ.

import { chunkText } from "./chunks";
import { embedQuery, embedTexts } from "./embeddings";
import { supabase } from "./supabase";
import {
  getBibleEntries,
  getCanonSources,
  getChapters,
} from "./data";
import type { RetrievedChunk } from "./types";

/** Giới hạn số chunk mỗi lần lập chỉ mục để tránh timeout API route. */
export const MAX_CHUNKS_PER_INDEX = 120;
/** Ngưỡng tương tự cosine tối thiểu để 1 chunk được đưa vào prompt. */
const MIN_SIMILARITY = 0.3;

export type IndexSourceType = "canon" | "chapter" | "bible";

export interface IndexResult {
  indexed: boolean;
  /** "supabase" = đã lưu vector lên cloud, "local" = chưa nối Supabase. */
  mode: "supabase" | "local";
  chunks: number;
  /** true nếu nội dung quá dài và chỉ lập chỉ mục được phần đầu. */
  truncated: boolean;
}

/**
 * Lập chỉ mục 1 nguồn (chương / nguồn canon / mục Bible):
 * cắt chunk → embed → xóa vector cũ của nguồn đó → lưu vector mới.
 * Gọi sau khi xuất bản chương, sau khi lưu nguồn canon, sau khi lưu Bible.
 */
export async function indexSource(input: {
  storyId: string;
  sourceType: IndexSourceType;
  sourceId: string;
  title: string;
  content: string;
}): Promise<IndexResult> {
  if (!supabase) {
    return { indexed: false, mode: "local", chunks: 0, truncated: false };
  }
  const allChunks = chunkText(input.content);
  const truncated = allChunks.length > MAX_CHUNKS_PER_INDEX;
  const chunks = allChunks.slice(0, MAX_CHUNKS_PER_INDEX);
  if (chunks.length === 0) {
    return { indexed: false, mode: "supabase", chunks: 0, truncated: false };
  }

  const vectors = await embedTexts(
    chunks.map((c) => c.text),
    "RETRIEVAL_DOCUMENT"
  );

  // Xóa vector cũ của nguồn này trước khi lưu bản mới (tránh trùng lặp
  // khi user sửa rồi xuất bản lại).
  const { error: delError } = await supabase
    .from("embeddings")
    .delete()
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId);
  if (delError) {
    throw new Error(`Xóa vector cũ thất bại: ${delError.message}`);
  }

  const rows = chunks.map((c, i) => ({
    story_id: input.storyId,
    source_type: input.sourceType,
    source_id: input.sourceId,
    chunk_index: c.index,
    content: c.text,
    embedding: vectors[i],
  }));
  // Insert theo lô nhỏ để request không quá lớn.
  for (let i = 0; i < rows.length; i += 25) {
    const { error } = await supabase
      .from("embeddings")
      .insert(rows.slice(i, i + 25));
    if (error) {
      throw new Error(`Lưu vector thất bại: ${error.message}`);
    }
  }
  return { indexed: true, mode: "supabase", chunks: rows.length, truncated };
}

/** Xóa toàn bộ vector của 1 nguồn (gọi khi user xóa chương/canon/Bible). */
export async function deleteEmbeddingsForSource(
  sourceType: IndexSourceType,
  sourceId: string
): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase
    .from("embeddings")
    .delete()
    .eq("source_type", sourceType)
    .eq("source_id", sourceId);
  if (error) {
    throw new Error(`Xóa vector thất bại: ${error.message}`);
  }
}

interface MatchRow {
  source_type: string;
  source_id: string | null;
  chunk_index: number;
  content: string;
  similarity: number;
}

/**
 * Tìm top đoạn liên quan nhất tới chương đang kiểm tra bằng vector.
 * Trả về mảng rỗng (không throw) nếu chưa nối Supabase hoặc RPC lỗi —
 * route kiểm tra sẽ tự fallback sang ngữ cảnh do client gửi kèm.
 */
export async function retrieveVector(input: {
  storyId: string;
  queryText: string;
  /** Không lấy chunk của chính chương đang kiểm tra. */
  excludeSourceId?: string;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  if (!supabase) return [];
  try {
    const queryVector = await embedQuery(input.queryText);
    const { data, error } = await supabase.rpc("match_embeddings", {
      query_embedding: queryVector,
      p_story_id: input.storyId,
      match_count: input.topK ?? 10,
      p_exclude_source_id: input.excludeSourceId ?? null,
    });
    if (error || !data) {
      console.warn("[rag] match_embeddings lỗi:", error?.message);
      return [];
    }
    const rows = (data as MatchRow[]).filter(
      (r) => r.similarity >= MIN_SIMILARITY
    );
    if (rows.length === 0) return [];

    // Lấy tên hiển thị cho từng nguồn để AI trích dẫn được rõ ràng.
    const [chapters, canons, bibles] = await Promise.all([
      getChapters(input.storyId).catch(() => []),
      getCanonSources(input.storyId).catch(() => []),
      getBibleEntries(input.storyId).catch(() => []),
    ]);
    const chapterLabel = new Map(
      chapters.map((c) => [c.id, `Chương ${c.number} — ${c.title}`])
    );
    const canonLabel = new Map(canons.map((c) => [c.id, `Canon: ${c.title}`]));
    const bibleLabel = new Map(bibles.map((b) => [b.id, `Bible: ${b.title}`]));

    return rows.map((r) => {
      const base =
        r.source_type === "chapter"
          ? chapterLabel.get(r.source_id ?? "") ?? "Chương (không rõ)"
          : r.source_type === "canon"
            ? canonLabel.get(r.source_id ?? "") ?? "Canon (không rõ)"
            : r.source_type === "bible"
              ? bibleLabel.get(r.source_id ?? "") ?? "Bible (không rõ)"
              : "Tóm tắt";
      return {
        label: `${base} (đoạn ${r.chunk_index + 1})`,
        sourceType: r.source_type as RetrievedChunk["sourceType"],
        text: r.content,
        score: Math.round(r.similarity * 100) / 100,
      };
    });
  } catch (err) {
    console.warn("[rag] retrieveVector lỗi, bỏ qua RAG vector:", err);
    return [];
  }
}
