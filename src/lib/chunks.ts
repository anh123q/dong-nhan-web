// Cắt văn bản thành chunk + tìm kiếm từ khóa — dùng chung cho cả
// client (fallback khi chưa có Supabase) và server (trước khi embed).
// File này KHÔNG gọi API nào, import được từ cả 2 phía.

export interface TextChunk {
  index: number;
  text: string;
  /** Ước lượng số token (tiếng Việt ~3 ký tự/token) */
  tokens: number;
}

/**
 * Ước lượng token cho văn bản tiếng Việt.
 * Gemini tokenize tiếng Việt khoảng 2-3 ký tự/token; lấy /3 để an toàn
 * (ước lượng thấp hơn thực tế một chút, chunk sẽ hơi nhỏ — không sao).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

// Kích thước chunk mặc định: ~800 token ≈ 2400 ký tự, overlap ~200 token.
export const DEFAULT_CHUNK_CHARS = 2400;
export const DEFAULT_OVERLAP_CHARS = 600;

/**
 * Cắt văn bản thành các chunk theo đoạn văn (ngắt ở \n\n khi có thể).
 * Chunk cuối của đoạn trước được lặp lại một phần ở đầu chunk sau
 * (overlap) để ý không bị đứt giữa chừng.
 */
export function chunkText(
  text: string,
  opts: { targetChars?: number; overlapChars?: number } = {}
): TextChunk[] {
  const target = opts.targetChars ?? DEFAULT_CHUNK_CHARS;
  const overlap = opts.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  // Tách theo đoạn, đoạn nào dài hơn target thì cắt cứng theo ký tự.
  const paragraphs: string[] = [];
  for (const para of clean.split(/\n{2,}/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length <= target) {
      paragraphs.push(p);
    } else {
      for (let i = 0; i < p.length; i += target) {
        paragraphs.push(p.slice(i, i + target));
      }
    }
  }

  const chunks: TextChunk[] = [];
  let current = "";
  const pushCurrent = () => {
    const t = current.trim();
    if (!t) return;
    chunks.push({ index: chunks.length, text: t, tokens: estimateTokens(t) });
    // Giữ lại đuôi làm overlap cho chunk sau (cắt ở khoảng trắng gần nhất).
    const tail = t.slice(-overlap);
    const spaceAt = tail.search(/\s/);
    current = spaceAt === -1 ? tail : tail.slice(spaceAt + 1);
  };

  for (const para of paragraphs) {
    if (current && current.length + 1 + para.length > target) {
      pushCurrent();
    }
    current = current ? `${current}\n\n${para}` : para;
  }
  pushCurrent();
  return chunks;
}

// ---------- Tìm kiếm từ khóa (fallback khi chưa có vector) ----------

const VI_STOPWORDS = new Set([
  "và", "của", "là", "có", "trong", "với", "cho", "được", "không", "một",
  "các", "những", "đã", "sẽ", "khi", "mà", "thì", "ở", "từ", "đến", "như",
  "về", "này", "đó", "đây", "kia", "lại", "cũng", "rất", "hơn", "để",
  "bị", "do", "vì", "nếu", "hay", "hoặc", "nhưng", "nên", "cần", "phải",
  "anh", "chị", "em", "tôi", "ta", "nó", "hắn", "cô", "chú", "bác", "ông",
  "người", "mình", "ai", "gì", "sao", "thế", "vậy", "rồi", "đang", "chỉ",
  "mới", "còn", "đều", "từng", "mỗi", "nào", "ra", "vào", "lên", "xuống",
]);

/** Tách từ khóa tiếng Việt: chữ thường, bỏ stopword và từ quá ngắn. */
export function extractKeywords(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 2 && !VI_STOPWORDS.has(w));
  return [...new Set(words)];
}

export interface RankedChunk {
  /** Nhãn hiển thị nguồn, vd: "Chương 3 — Lựa chọn" hay "Canon: Quyển 1" */
  label: string;
  /** Loại nguồn: chapter | canon | bible | summary */
  sourceType: "chapter" | "canon" | "bible" | "summary";
  text: string;
  score: number;
}

/**
 * Chấm điểm chunk theo độ trùng từ khóa với câu truy vấn.
 * Điểm = số từ khóa riêng biệt trùng + 0.1 * tổng số lần xuất hiện.
 * Đủ tốt cho chế độ local (chưa có Supabase/vector).
 */
export function rankChunksByKeywords(
  queryText: string,
  candidates: Array<{
    label: string;
    sourceType: RankedChunk["sourceType"];
    text: string;
  }>,
  topK = 8
): RankedChunk[] {
  const keywords = extractKeywords(queryText);
  if (keywords.length === 0) return [];
  const scored: RankedChunk[] = [];
  for (const c of candidates) {
    const lower = c.text.toLowerCase();
    let distinct = 0;
    let hits = 0;
    for (const kw of keywords) {
      // Đếm số lần xuất hiện, giới hạn 5 để 1 từ không áp đảo.
      let count = 0;
      let pos = 0;
      while (count < 5) {
        const at = lower.indexOf(kw, pos);
        if (at === -1) break;
        count++;
        pos = at + kw.length;
      }
      if (count > 0) {
        distinct++;
        hits += count;
      }
    }
    if (distinct === 0) continue;
    scored.push({
      label: c.label,
      sourceType: c.sourceType,
      text: c.text,
      score: distinct + 0.1 * hits,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
