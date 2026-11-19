// Tóm tắt tự động bằng AI (chạy phía server).
// Khi 1 chương được xuất bản, hệ thống gọi Gemini (model nhẹ
// gemini-3.5-flash-lite cho tiết kiệm quota) để tạo:
// - Tóm tắt chương có cấu trúc: sự kiện, thay đổi nhân vật, sự thật
//   mới, plot thread còn mở (+ 1 dòng tóm tắt ngắn).
// - Cập nhật tóm tắt arc tổng thể của truyện (1 đoạn ngắn, giữ mạch
//   truyện dài mà không cần nhét toàn bộ chương vào prompt).

import { callGeminiJson, callGeminiText } from "./gemini";
import type { StructuredSummary } from "./types";

const MAX_CHAPTER_CHARS = 30_000;

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/** Chuẩn hóa kết quả JSON của Gemini thành StructuredSummary hợp lệ. */
export function normalizeStructuredSummary(
  raw: unknown,
  fallbackOneLine: string
): StructuredSummary {
  const obj = (raw ?? {}) as Partial<StructuredSummary>;
  return {
    oneLine:
      typeof obj.oneLine === "string" && obj.oneLine.trim()
        ? obj.oneLine.trim()
        : fallbackOneLine,
    events: cleanStringArray(obj.events),
    characterChanges: cleanStringArray(obj.characterChanges),
    newFacts: cleanStringArray(obj.newFacts),
    openThreads: cleanStringArray(obj.openThreads),
  };
}

/**
 * Đọc lại tóm tắt đã lưu: nếu là JSON có cấu trúc thì parse, nếu là
 * text thường (tóm tắt tay cũ) thì coi cả đoạn là oneLine.
 */
export function parseStructuredSummary(text: string): StructuredSummary {
  try {
    const parsed = JSON.parse(text) as Partial<StructuredSummary>;
    if (parsed && typeof parsed === "object" && "oneLine" in parsed) {
      return normalizeStructuredSummary(parsed, text.slice(0, 300));
    }
  } catch {
    // Không phải JSON — tóm tắt tay cũ, xử lý bên dưới.
  }
  return {
    oneLine: text,
    events: [],
    characterChanges: [],
    newFacts: [],
    openThreads: [],
  };
}

/** Render StructuredSummary thành text dễ đọc để đưa vào prompt. */
export function structuredSummaryToText(
  s: StructuredSummary,
  label: string
): string {
  const lines = [`${label}: ${s.oneLine}`];
  const pushSection = (title: string, items: string[]) => {
    if (items.length > 0) lines.push(`  ${title}: ${items.join("; ")}`);
  };
  pushSection("Sự kiện", s.events);
  pushSection("Thay đổi nhân vật", s.characterChanges);
  pushSection("Sự thật mới", s.newFacts);
  pushSection("Thread còn mở", s.openThreads);
  return lines.join("\n");
}

/**
 * Tạo tóm tắt có cấu trúc cho 1 chương. Dùng model nhẹ (bulk) vì
 * việc này chạy thường xuyên (mỗi lần xuất bản 1 chương).
 */
export async function summarizeChapterStructured(
  chapterNumber: number,
  chapterTitle: string,
  chapterContent: string
): Promise<{ summary: StructuredSummary; model: string }> {
  const content = chapterContent.slice(0, MAX_CHAPTER_CHARS);
  const { text, model } = await callGeminiJson(
    `Bạn là biên tập viên tóm tắt truyện đồng nhân (fanfiction) tiếng Việt.
Hãy tóm tắt chương dưới đây để phục vụ kiểm tra tính nhất quán cho các chương sau.
CHỈ tóm tắt những gì CÓ trong chương, không suy diễn thêm, không bịa.

Chương ${chapterNumber} "${chapterTitle}":
${content}

Trả về JSON đúng định dạng sau, không thêm chữ nào khác:
{
  "oneLine": "Tóm tắt toàn chương trong 1-2 câu",
  "events": ["Sự kiện chính 1", "Sự kiện chính 2"],
  "characterChanges": ["Nhân vật X thay đổi gì (khả năng, quan hệ, trạng thái...)"],
  "newFacts": ["Sự thật/bí mật/quy tắc mới được tiết lộ"],
  "openThreads": ["Câu hỏi/bí ẩn/lời hứa còn bỏ ngỏ sau chương này"]
}
Mảng nào không có nội dung thì để []. Viết ngắn gọn, mỗi mục 1 dòng.`,
    { bulk: true, temperature: 0.2, maxOutputTokens: 2048 }
  );
  const parsed = JSON.parse(
    text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
  ) as unknown;
  return {
    summary: normalizeStructuredSummary(
      parsed,
      `Chương ${chapterNumber} "${chapterTitle}"`
    ),
    model,
  };
}

/**
 * Cập nhật tóm tắt arc tổng thể của truyện: gộp tóm tắt arc cũ với
 * tóm tắt chương mới thành 1 đoạn ngắn (~300-500 từ). Cách cập nhật
 * tăng dần này rẻ hơn nhiều so với đọc lại toàn bộ chương.
 * Nếu chưa có arc cũ, tạo mới từ tóm tắt chương.
 */
export async function updateArcSummary(
  previousArcSummary: string | null,
  newChapterSummary: StructuredSummary,
  chapterNumber: number,
  chapterTitle: string
): Promise<{ arcSummary: string; model: string }> {
  const newText = structuredSummaryToText(
    newChapterSummary,
    `Chương ${chapterNumber} "${chapterTitle}"`
  );
  if (!previousArcSummary?.trim()) {
    return { arcSummary: newText, model: "local" };
  }
  const { text, model } = await callGeminiText(
    `Bạn là biên tập viên theo dõi mạch truyện dài.
Dưới đây là TÓM TẮT ARC HIỆN TẠI của một truyện đồng nhân và TÓM TẮT CHƯƠNG MỚI NHẤT.
Hãy viết lại TÓM TẮT ARC MỚI (tiếng Việt, 300-500 từ) gộp cả hai: giữ lại các sự kiện lớn,
trạng thái nhân vật chính, các bí ẩn/thread còn mở; bỏ chi tiết nhỏ đã lỗi thời.
Không bịa thêm sự kiện. Chỉ trả về đoạn tóm tắt, không thêm tiêu đề hay giải thích.

## TÓM TẮT ARC HIỆN TẠI
${previousArcSummary.slice(0, 6000)}

## TÓM TẮT CHƯƠNG MỚI
${newText}`,
    { bulk: true, temperature: 0.2, maxOutputTokens: 2048 }
  );
  return { arcSummary: text.trim(), model };
}
