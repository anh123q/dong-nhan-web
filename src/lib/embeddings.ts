// Gọi Gemini Embedding API phía server (REST, key từ GEMINI_API_KEY).
// Chỉ import từ API route / lib server — không import từ component client.
//
// Model (đã kiểm chứng bằng key thật, tháng 11/2026):
// - text-embedding-004 KHÔNG còn tồn tại → dùng gemini-embedding-001.
// - gemini-embedding-001 mặc định trả 3072 chiều, nhưng schema Supabase
//   đang là vector(768) nên mọi lần gọi đều đặt outputDimensionality=768
//   (model hỗ trợ rút gọn chiều bằng Matryoshka, chất lượng gần như giữ
//   nguyên ở 768). Đổi model qua GEMINI_EMBED_MODEL.

import { hasGeminiKey } from "./gemini";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export const DEFAULT_EMBED_MODEL = "gemini-embedding-001";
/** Số chiều vector — PHẢI khớp cột embedding vector(768) trong schema.sql. */
export const EMBED_DIMENSIONS = 768;

export function getEmbedModel(): string {
  return process.env.GEMINI_EMBED_MODEL || DEFAULT_EMBED_MODEL;
}

export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

/** Tối đa 100 request/lần gọi batch theo giới hạn của Gemini API. */
const BATCH_SIZE = 50;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!hasGeminiKey() || !key) {
    throw new Error("Chưa cấu hình GEMINI_API_KEY");
  }
  return key;
}

interface BatchEmbedResponse {
  embeddings?: Array<{ values?: number[] }>;
}

/**
 * Embed nhiều text trong 1 lần gọi batch (tối đa 50 text/lần).
 * Trả về mảng vector theo đúng thứ tự đầu vào.
 * taskType: RETRIEVAL_DOCUMENT cho chunk lưu trữ, RETRIEVAL_QUERY cho
 * câu truy vấn — tách riêng giúp tìm kiếm chính xác hơn.
 */
export async function embedTexts(
  texts: string[],
  taskType: EmbedTaskType = "RETRIEVAL_DOCUMENT"
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = getApiKey();
  const model = getEmbedModel();
  const all: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${GEMINI_API_BASE}/${model}:batchEmbedContents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBED_DIMENSIONS,
        })),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Gemini Embedding lỗi ${res.status}: ${body.slice(0, 300) || res.statusText}`
      );
    }
    const data = (await res.json()) as BatchEmbedResponse;
    const vectors = data.embeddings ?? [];
    if (vectors.length !== batch.length) {
      throw new Error(
        `Gemini Embedding trả thiếu vector (${vectors.length}/${batch.length})`
      );
    }
    for (const v of vectors) {
      if (!v.values || v.values.length !== EMBED_DIMENSIONS) {
        throw new Error(
          `Vector embedding sai số chiều (${v.values?.length ?? 0}, cần ${EMBED_DIMENSIONS}) — hãy kiểm tra GEMINI_EMBED_MODEL`
        );
      }
      all.push(v.values);
    }
  }
  return all;
}

/** Embed 1 câu truy vấn (dùng khi tìm đoạn liên quan). */
export async function embedQuery(queryText: string): Promise<number[]> {
  const [vector] = await embedTexts([queryText], "RETRIEVAL_QUERY");
  return vector;
}
