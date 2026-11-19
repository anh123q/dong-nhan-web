"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createCanonSource,
  deleteCanonSource,
  getCanonSources,
  getStories,
} from "@/lib/data";
import type { CanonSource, Story } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500";

type Tab = "paste" | "file" | "url";

export default function ImporterPage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [storyId, setStoryId] = useState("");
  const [sources, setSources] = useState<CanonSource[]>([]);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<Tab>("paste");
  const [title, setTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileText, setFileText] = useState("");
  const [url, setUrl] = useState("");
  const [urlPreview, setUrlPreview] = useState<{
    title: string;
    text: string;
    charCount: number;
  } | null>(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshSources = async (id: string) => {
    if (!id) {
      setSources([]);
      return;
    }
    setSources(await getCanonSources(id));
  };

  useEffect(() => {
    (async () => {
      const list = await getStories();
      setStories(list);
      // Đọc ?story=... từ URL (đọc bằng window để khỏi cần Suspense).
      const preselect =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("story") ?? ""
          : "";
      const initial = list.find((s) => s.id === preselect)?.id ?? list[0]?.id ?? "";
      setStoryId(initial);
      await refreshSources(initial);
      setLoading(false);
    })();
  }, []);

  const onSelectStory = async (id: string) => {
    setStoryId(id);
    setMessage("");
    setError("");
    await refreshSources(id);
  };

  const saveSource = async (
    sourceTitle: string,
    content: string,
    type: CanonSource["sourceType"],
    sourceUrl?: string
  ) => {
    if (!storyId) {
      setError("Hãy chọn truyện trước.");
      return;
    }
    if (!content.trim()) {
      setError("Nội dung trống, chưa lưu được.");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const saved = await createCanonSource({
        storyId,
        title: sourceTitle.trim() || "Nguồn canon chưa đặt tên",
        sourceType: type,
        sourceUrl,
        content: content.trim(),
      });
      await refreshSources(storyId);
      setMessage("Đã lưu nguồn canon.");
      setPasteText("");
      setFileText("");
      setFileName("");
      setUrlPreview(null);
      setTitle("");
      // Lập chỉ mục RAG cho nguồn mới (chạy nền, lỗi thì chỉ báo 1 dòng).
      try {
        const res = await fetch("/api/ai/index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storyId,
            sourceType: "canon",
            sourceId: saved.id,
            title: saved.title,
            content: saved.content,
          }),
        });
        const data = (await res.json()) as {
          indexed?: boolean;
          mode?: string;
          chunks?: number;
          truncated?: boolean;
        };
        if (res.ok && data.indexed) {
          setMessage(
            `Đã lưu nguồn canon. Đã lập chỉ mục AI (${data.chunks} đoạn${data.truncated ? ", nội dung quá dài nên chỉ lập chỉ mục phần đầu" : ""}).`
          );
        } else if (res.ok && data.mode === "local") {
          setMessage(
            "Đã lưu nguồn canon. (Chưa nối Supabase nên AI sẽ tìm theo từ khóa thay vì vector.)"
          );
        }
      } catch {
        // Bỏ qua — nguồn đã lưu, chỉ thiếu chỉ mục AI.
      }
    } catch {
      setError("Không lưu được nguồn, hãy thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const onFileChange = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setFileText(String(reader.result ?? ""));
    reader.onerror = () => setError("Không đọc được file.");
    reader.readAsText(file);
  };

  const onFetchUrl = async () => {
    if (!url.trim()) {
      setError("Hãy nhập URL.");
      return;
    }
    setBusy(true);
    setError("");
    setUrlPreview(null);
    try {
      const res = await fetch("/api/import-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as {
        title?: string;
        text?: string;
        charCount?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? `Lỗi ${res.status}`);
        return;
      }
      setUrlPreview({
        title: data.title ?? "",
        text: data.text ?? "",
        charCount: data.charCount ?? 0,
      });
      if (!title && data.title) setTitle(data.title);
    } catch {
      setError("Không gọi được API nhập URL.");
    } finally {
      setBusy(false);
    }
  };

  const onDeleteSource = async (s: CanonSource) => {
    if (!window.confirm(`Xóa nguồn "${s.title}"?`)) return;
    await deleteCanonSource(s.id);
    // Xóa luôn vector của nguồn này để AI không đối chiếu với nguồn đã xóa.
    void fetch(
      `/api/ai/index?sourceType=canon&sourceId=${encodeURIComponent(s.id)}`,
      { method: "DELETE" }
    ).catch(() => undefined);
    refreshSources(storyId);
  };

  if (loading) return <p className="text-sm text-stone-500">Đang tải...</p>;

  if (stories.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <p className="font-medium">Chưa có truyện nào để gắn nguồn canon.</p>
        <Link
          href="/viet"
          className="mt-3 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Tạo truyện trước
        </Link>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "paste", label: "📋 Paste text" },
    { id: "file", label: "📄 Upload file .txt" },
    { id: "url", label: "🔗 Nhập từ URL" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold">Nhập truyện gốc (canon)</h1>
      <p className="mt-1 text-sm text-stone-500">
        Nạp nội dung nguyên tác để AI đối chiếu khi bạn viết đồng nhân. Nguồn
        canon được tách riêng với truyện bạn viết — AI sẽ biết đâu là gốc, đâu
        là bạn sáng tạo thêm.
      </p>

      <div className="mt-5">
        <label className="mb-1 block text-sm font-semibold">
          Gắn vào truyện
        </label>
        <select
          value={storyId}
          onChange={(e) => onSelectStory(e.target.value)}
          className={`${inputCls} max-w-md`}
        >
          {stories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} (nguyên tác: {s.originalWork || "—"})
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setError("");
                setMessage("");
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                tab === t.id
                  ? "border-amber-600 bg-amber-50 text-amber-800"
                  : "border-stone-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-semibold">
            Tên nguồn (VD: Đấu La Đại Lục — quyển 1)
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Đặt tên để dễ phân biệt các nguồn"
            className={inputCls}
          />
        </div>

        {tab === "paste" && (
          <div>
            <label className="mb-1 block text-sm font-semibold">
              Dán nội dung truyện gốc
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
              placeholder="Dán text nguyên tác vào đây..."
              className={inputCls}
            />
            <p className="mt-1 text-xs text-stone-500">
              {pasteText.length.toLocaleString("vi-VN")} ký tự
            </p>
            <button
              onClick={() => saveSource(title, pasteText, "paste")}
              disabled={busy}
              className="mt-3 rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy ? "Đang lưu..." : "Lưu nguồn canon"}
            </button>
          </div>
        )}

        {tab === "file" && (
          <div>
            <input
              type="file"
              accept=".txt,text/plain"
              onChange={(e) => onFileChange(e.target.files?.[0])}
              className="text-sm"
            />
            {fileName && (
              <p className="mt-2 text-sm text-stone-600">
                Đã chọn: {fileName} · {fileText.length.toLocaleString("vi-VN")}{" "}
                ký tự
              </p>
            )}
            {fileText && (
              <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-stone-100 p-3 text-xs whitespace-pre-wrap">
                {fileText.slice(0, 2000)}
                {fileText.length > 2000 ? "\n..." : ""}
              </pre>
            )}
            <button
              onClick={() => saveSource(title || fileName, fileText, "file")}
              disabled={busy || !fileText}
              className="mt-3 rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {busy ? "Đang lưu..." : "Lưu nguồn canon"}
            </button>
            <p className="mt-2 text-xs text-stone-500">
              Hiện hỗ trợ file .txt. File PDF/EPUB/DOCX sẽ hỗ trợ ở bản sau —
              tạm thời hãy copy text ra file .txt.
            </p>
          </div>
        )}

        {tab === "url" && (
          <div>
            <label className="mb-1 block text-sm font-semibold">
              URL trang truyện
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                className={`${inputCls} min-w-64 flex-1`}
              />
              <button
                onClick={onFetchUrl}
                disabled={busy}
                className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:border-amber-400 disabled:opacity-50"
              >
                {busy ? "Đang tải..." : "Tải thử"}
              </button>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              Một số web truyện chặn bot hoặc render bằng JavaScript nên không
              tải được — khi đó hãy dùng cách paste text hoặc file .txt.
            </p>
            {urlPreview && (
              <div className="mt-3">
                <p className="text-sm font-medium">
                  {urlPreview.title} ·{" "}
                  {urlPreview.charCount.toLocaleString("vi-VN")} ký tự
                </p>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-stone-100 p-3 text-xs whitespace-pre-wrap">
                  {urlPreview.text.slice(0, 2000)}
                  {urlPreview.text.length > 2000 ? "\n..." : ""}
                </pre>
                <button
                  onClick={() =>
                    saveSource(title || urlPreview.title, urlPreview.text, "url", url.trim())
                  }
                  disabled={busy}
                  className="mt-3 rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {busy ? "Đang lưu..." : "Lưu nguồn canon này"}
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">
        Nguồn canon đã nhập ({sources.length})
      </h2>
      {sources.length === 0 ? (
        <p className="text-sm text-stone-500">
          Chưa có nguồn nào cho truyện này.
        </p>
      ) : (
        <ul className="space-y-3">
          {sources.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-stone-200 bg-white px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-xs text-stone-500">
                    {s.sourceType === "paste"
                      ? "Paste text"
                      : s.sourceType === "file"
                        ? "File .txt"
                        : `URL: ${s.sourceUrl ?? ""}`}{" "}
                    · {s.charCount.toLocaleString("vi-VN")} ký tự ·{" "}
                    {new Date(s.createdAt).toLocaleDateString("vi-VN")}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-stone-600">
                    {s.content.slice(0, 300)}
                  </p>
                </div>
                <button
                  onClick={() => onDeleteSource(s)}
                  className="shrink-0 rounded-lg border border-red-200 px-3 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Xóa
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
