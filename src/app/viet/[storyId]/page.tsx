"use client";

import {Suspense, useEffect, useState} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  deleteChapter,
  getChapters,
  getStory,
  saveChapter,
  updateStory,
} from "@/lib/data";
import { processCoverImage } from "@/lib/image";
import { STORY_STATUS_LABEL, type Chapter, type Story, type StoryStatus } from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500";

function EditStoryPageContent() {
  const params = useParams();
  const router = useRouter();
  const storyId = params.storyId as string;

  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState("");
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [originalWork, setOriginalWork] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<StoryStatus>("dang-viet");
  const [coverUrl, setCoverUrl] = useState<string | undefined>(undefined);

  const refresh = async () => {
    const s = await getStory(storyId);
    if (!s) {
      setLoading(false);
      return;
    }
    setStory(s);
    setTitle(s.title);
    setOriginalWork(s.originalWork);
    setDescription(s.description);
    setTags(s.tags.join(", "));
    setStatus(s.status);
    setCoverUrl(s.coverUrl);
    setChapters(await getChapters(storyId));
    setLoading(false);
  };

  // Chỉ tải lại danh sách chương (không chạm vào form thông tin truyện
  // để không xóa nội dung user đang sửa dở).
  const refreshChapters = async () => {
    setChapters(await getChapters(storyId));
  };

  useEffect(() => {
    refresh();
    // Quay lại tab/cửa sổ thì tải lại danh sách chương cho chắc.
    const onFocus = () => {
      void refreshChapters();
    };
    const onVisibility = () => {
      if (!document.hidden) void refreshChapters();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId]);

  const onSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Tên truyện không được để trống.");
      return;
    }
    setSaving(true);
    setError("");
    const updated = await updateStory(storyId, {
      title: title.trim(),
      originalWork: originalWork.trim(),
      description: description.trim(),
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      status,
      coverUrl,
    });
    setSaving(false);
    if (updated) {
      setStory(updated);
      setSavedAt(new Date().toLocaleTimeString("vi-VN"));
    } else {
      setError("Không lưu được, hãy thử lại.");
    }
  };

  const onCoverChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      setCoverUrl(await processCoverImage(file));
    } catch {
      setError("Không đọc được file ảnh bìa.");
    }
  };

  const onNewChapter = async () => {
    const nextNumber =
      chapters.length > 0
        ? Math.max(...chapters.map((c) => c.number)) + 1
        : 1;
    const chapter = await saveChapter({
      storyId,
      number: nextNumber,
      title: "",
      content: "",
      status: "nhap",
    });
    router.push(`/viet/${storyId}/chuong/${chapter.id}`);
  };

  const onDeleteChapter = async (c: Chapter) => {
    if (
      !window.confirm(
        `Xóa chương ${c.number} "${c.title || "(chưa đặt tên)"}"? Không hoàn tác được.`
      )
    )
      return;
    await deleteChapter(c.id);
    // Xóa luôn vector của chương này để AI không đối chiếu với chương đã xóa.
    void fetch(
      `/api/ai/index?sourceType=chapter&sourceId=${encodeURIComponent(c.id)}`,
      { method: "DELETE" }
    ).catch(() => undefined);
    setChapters(await getChapters(storyId));
  };

  if (loading) return <p className="text-sm text-stone-500">Đang tải...</p>;
  if (!story) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <p className="font-medium">Không tìm thấy truyện này.</p>
        <Link href="/viet" className="mt-3 inline-block text-sm text-amber-700 underline">
          Về trang Viết truyện
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Sửa truyện</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/truyen/${storyId}`}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold hover:border-amber-400"
          >
            Xem trang truyện
          </Link>
          <Link
            href={`/bible/${storyId}`}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold hover:border-amber-400"
          >
            📕 Story Bible
          </Link>
          <Link
            href={`/nhap?story=${storyId}`}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold hover:border-amber-400"
          >
            📥 Nhập truyện gốc
          </Link>
        </div>
      </div>

      <form
        onSubmit={onSaveInfo}
        className="mb-8 space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold">Tên truyện *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Nguyên tác</label>
            <input
              value={originalWork}
              onChange={(e) => setOriginalWork(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">Giới thiệu</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputCls}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold">
              Tag (cách nhau bằng dấu phẩy)
            </label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">Trạng thái</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StoryStatus)}
              className={inputCls}
            >
              {(Object.keys(STORY_STATUS_LABEL) as StoryStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STORY_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-semibold">Ảnh bìa</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onCoverChange(e.target.files?.[0])}
              className="text-sm"
            />
          </div>
          {coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt="Bìa truyện"
              className="h-28 w-20 rounded-lg object-cover"
            />
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Đang lưu..." : "Lưu thông tin truyện"}
          </button>
          {savedAt && (
            <span className="text-sm text-emerald-700">Đã lưu lúc {savedAt}</span>
          )}
        </div>
      </form>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">Các chương ({chapters.length})</h2>
        <button
          onClick={onNewChapter}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          + Chương mới
        </button>
      </div>
      {chapters.length === 0 ? (
        <p className="text-sm text-stone-500">
          Chưa có chương nào. Bấm “Chương mới” để viết chương đầu tiên.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {chapters.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <Link
                href={`/viet/${storyId}/chuong/${c.id}`}
                className="min-w-0 font-medium hover:text-amber-700"
              >
                Chương {c.number}: {c.title || "(chưa đặt tên)"}
              </Link>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    c.status === "xuat-ban"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-stone-100 text-stone-600"
                  }`}
                >
                  {c.status === "xuat-ban" ? "Đã xuất bản" : "Nháp"}
                </span>
                <span className="text-xs text-stone-400">
                  {c.wordCount.toLocaleString("vi-VN")} từ
                </span>
                <Link
                  href={`/viet/${storyId}/chuong/${c.id}`}
                  className="rounded-lg border border-stone-300 px-3 py-1 text-sm font-semibold hover:border-amber-400"
                >
                  Sửa
                </Link>
                <button
                  onClick={() => onDeleteChapter(c)}
                  className="rounded-lg border border-red-200 px-3 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
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

export default function EditStoryPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Đang tải...</p>}>
      <EditStoryPageContent />
    </Suspense>
  );
}
