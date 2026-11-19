import { NextResponse } from "next/server";

/**
 * POST /api/import-url — lấy text chính từ 1 URL để nhập làm nguồn canon.
 * Body: { "url": "https://..." }
 * Trả về: { title, text, charCount, url }
 *
 * Chỉ fetch phía server (tránh lỗi CORS ở trình duyệt), trích text thô bằng
 * regex (không thêm dependency). Trang web truyện thường chặn bot hoặc trả
 * nội dung render bằng JS — khi đó route sẽ báo lỗi và user nên dùng cách
 * paste text trực tiếp hoặc upload file .txt.
 */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_TEXT_CHARS = 500_000;

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h.startsWith("10.") ||
    h.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** Trích text đọc được từ HTML: ưu tiên <article>, rồi <main>, rồi <body>. */
function extractText(html: string): { title: string; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, "")).trim()
    : "";

  let scope = html;
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const main = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (article) scope = article[1];
  else if (main) scope = main[1];

  // Bỏ các khối không phải nội dung chính.
  scope = scope
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // Chuyển thẻ khối thành xuống dòng rồi bỏ toàn bộ thẻ còn lại.
  const text = decodeEntities(
    scope
      .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { title, text };
}

export async function POST(request: Request) {
  try {
    const { url } = (await request.json()) as { url?: string };
    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "Thiếu URL." }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json(
        { error: "URL không hợp lệ." },
        { status: 400 }
      );
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json(
        { error: "Chỉ hỗ trợ URL http/https." },
        { status: 400 }
      );
    }
    if (isBlockedHost(parsed.hostname)) {
      return NextResponse.json(
        { error: "Không được fetch địa chỉ nội bộ." },
        { status: 400 }
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(parsed.toString(), {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: `Không tải được trang (HTTP ${res.status}). Trang có thể chặn bot — hãy thử paste text trực tiếp.` },
        { status: 502 }
      );
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      return NextResponse.json(
        { error: `URL không trả về trang HTML (content-type: ${contentType}).` },
        { status: 502 }
      );
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) {
      return NextResponse.json(
        { error: "Trang quá lớn (>2MB), không nhập được." },
        { status: 413 }
      );
    }

    const { title, text } = extractText(new TextDecoder().decode(buf));
    if (text.length < 50) {
      return NextResponse.json(
        {
          error:
            "Không trích được nội dung từ trang này (có thể trang render bằng JavaScript hoặc chặn bot). Hãy thử paste text trực tiếp hoặc upload file .txt.",
        },
        { status: 502 }
      );
    }

    const trimmed = text.slice(0, MAX_TEXT_CHARS);
    return NextResponse.json({
      title: title || parsed.hostname,
      text: trimmed,
      charCount: trimmed.length,
      url: parsed.toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    const isTimeout =
      err instanceof Error && err.name === "AbortError";
    console.error("[api/import-url]", err);
    return NextResponse.json(
      {
        error: isTimeout
          ? "Hết thời gian chờ tải trang (15 giây)."
          : `Không nhập được từ URL: ${message}`,
      },
      { status: 500 }
    );
  }
}
