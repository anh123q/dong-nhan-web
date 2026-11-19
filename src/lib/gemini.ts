// Gọi Gemini API phía server (key chỉ nằm trong biến môi trường,
// không bao giờ lộ ra trình duyệt). Dùng REST API trực tiếp để không
// cần thêm dependency.
//
// Model (đã kiểm chứng bằng key thật, tháng 11/2026):
// - gemini-2.5-flash ĐÃ CHẾT với user mới (API trả 404 "no longer
//   available to new users") — tuyệt đối không dùng làm mặc định.
// - Kiểm tra mâu thuẫn (cần chất lượng): gemini-3.8-flash.
//   Model này đôi khi 503 quá tải → tự fallback sang flash-lite.
// - Việc hàng loạt (tóm tắt chương): gemini-3.5-flash-lite thẳng,
//   tiết kiệm quota (free tier 500 request/ngày).
// Đổi model qua biến môi trường GEMINI_MODEL / GEMINI_BULK_MODEL.

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export const DEFAULT_CHECK_MODEL = "gemini-3.8-flash";
export const DEFAULT_BULK_MODEL = "gemini-3.5-flash-lite";

/** Model chính cho kiểm tra mâu thuẫn (chất lượng cao). */
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL || DEFAULT_CHECK_MODEL;
}

/** Model nhẹ cho việc hàng loạt: tóm tắt chương, cập nhật tóm tắt arc. */
export function getGeminiBulkModel(): string {
  return process.env.GEMINI_BULK_MODEL || DEFAULT_BULK_MODEL;
}

export function hasGeminiKey(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key.trim() !== "" && !key.includes("placeholder"));
}

export interface GeminiJsonResult {
  text: string;
  /** Model thực sự đã trả lời (có thể là fallback). */
  model: string;
  /** true nếu model chính lỗi và đã fallback sang model dự phòng. */
  fellBack: boolean;
}

class GeminiApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Dịch lỗi Gemini sang tiếng Việt thân thiện để hiển thị cho user.
 * 429 = hết hạn mức miễn phí, 404 = model không tồn tại/không còn
 * dùng được, 400 = key sai hoặc request sai, 503 = Google quá tải.
 */
export function describeGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/\b429\b/.test(raw)) {
    return "Đã hết hạn mức miễn phí của Gemini hôm nay (lỗi 429). Hãy thử lại sau — hạn mức reset vào nửa đêm giờ Mỹ (khoảng trưa giờ Việt Nam).";
  }
  if (/\b404\b/.test(raw)) {
    return `Model Gemini không còn dùng được (lỗi 404). Hãy kiểm tra biến GEMINI_MODEL trong .env.local — model mặc định hiện tại là ${DEFAULT_CHECK_MODEL}. Chi tiết: ${raw.slice(0, 200)}`;
  }
  if (/\b400\b/.test(raw) && /API_KEY/i.test(raw)) {
    return "GEMINI_API_KEY không hợp lệ. Hãy tạo key mới tại Google AI Studio và cập nhật .env.local.";
  }
  if (/\b503\b/.test(raw)) {
    return "Máy chủ Gemini đang quá tải tạm thời (lỗi 503). Hãy thử lại sau vài phút.";
  }
  return raw;
}

interface GenerateOpts {
  temperature?: number;
  maxOutputTokens?: number;
  /** Ép dùng model này thay vì model mặc định. */
  model?: string;
  /** true = việc hàng loạt (tóm tắt): dùng model nhẹ làm chính. */
  bulk?: boolean;
}

async function callOnce(
  model: string,
  prompt: string,
  opts: { temperature: number; maxOutputTokens: number; json: boolean }
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!hasGeminiKey() || !apiKey) {
    throw new Error("Chưa cấu hình GEMINI_API_KEY");
  }
  const res = await fetch(`${GEMINI_API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: opts.temperature,
        maxOutputTokens: opts.maxOutputTokens,
        ...(opts.json ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GeminiApiError(
      res.status,
      `Gemini API lỗi ${res.status}: ${body.slice(0, 300) || res.statusText}`
    );
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("") ?? "";
  if (!text) {
    throw new Error("Gemini trả về nội dung rỗng");
  }
  return text;
}

/**
 * Gọi Gemini với fallback: nếu model chính lỗi 503 (quá tải) hoặc 429
 * (hết hạn mức) thì tự thử model dự phòng 1 lần. gemini-3.8-flash đã
 * được ghi nhận là hay 503 khi tải cao, nên fallback là bắt buộc để
 * tính năng AI không "chết" theo model chính.
 */
async function callWithFallback(
  prompt: string,
  opts: GenerateOpts & { json: boolean }
): Promise<GeminiJsonResult> {
  const primary =
    opts.model ?? (opts.bulk ? getGeminiBulkModel() : getGeminiModel());
  // Dự phòng là "model còn lại": check chính ↔ bulk nhẹ.
  const fallback =
    primary === getGeminiBulkModel()
      ? getGeminiModel()
      : getGeminiBulkModel();
  const genOpts = {
    temperature: opts.temperature ?? 0.3,
    maxOutputTokens: opts.maxOutputTokens ?? 8192,
    json: opts.json,
  };
  try {
    const text = await callOnce(primary, prompt, genOpts);
    return { text, model: primary, fellBack: false };
  } catch (err) {
    const retriable =
      err instanceof GeminiApiError && (err.status === 503 || err.status === 429);
    if (!retriable || fallback === primary) throw err;
    console.warn(
      `[gemini] ${primary} lỗi ${err instanceof GeminiApiError ? err.status : ""}, fallback sang ${fallback}`
    );
    const text = await callOnce(fallback, prompt, genOpts);
    return { text, model: fallback, fellBack: true };
  }
}

/**
 * Gọi Gemini và yêu cầu trả về JSON thuần (không bọc markdown).
 * Trả về text thô để route tự parse theo schema của mình.
 */
export async function callGeminiJson(
  prompt: string,
  opts: GenerateOpts = {}
): Promise<GeminiJsonResult> {
  return callWithFallback(prompt, { ...opts, json: true });
}

/** Gọi Gemini trả về text thường (không ép JSON), có fallback như trên. */
export async function callGeminiText(
  prompt: string,
  opts: GenerateOpts = {}
): Promise<GeminiJsonResult> {
  return callWithFallback(prompt, { ...opts, json: false });
}

/** Parse JSON từ text Gemini trả về, chịu được cả khi bị bọc ```json. */
export function parseGeminiJson<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}
