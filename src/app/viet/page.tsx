"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createStory, deleteStory, getStories } from "@/lib/data";
import { processCoverImage } from "@/lib/image";
import { STORY_STATUS_LABEL, type Story, type StoryStatus } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500";

export default function WriteDashboardPage() {
  const router = useRouter();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Form tạo truyện mới.
  const [title, setTitle] = useState("");
  const [originalWork, setOriginalWork] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [status, setStatus] = useState<StoryStatus>("dang-viet");
  const [coverUrl, setCoverUrl] = useState<string | undefined>(undefined);
  const [coverName, setCoverName] = useState("");

  const refresh = async () => {
    setStories(await getStories());
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const onCoverChange = async (file: File | undefined) => {
    if (!file) return;
    try {
      const processed = await processCoverImage(file);
      setCoverUrl(processed);
      setCoverName(file.name);
    } catch {
      setError("Không đọc được file ảnh bìa.");
    }
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!title.trim()) {
      setError("Hãy nhập tên truyện.");
      return;
    }
    setSaving(true);
    try {
      const story = await createStory({
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
      router.push(`/viet/${story.id}`);
    } catch {
      setError("Không tạo được truyện, hãy thử lại.");
      setSaving(false);
    }
  };

  const onDelete = async (story: Story) => {
    if (
      !window.confirm(
        `Xóa truyện "${story.title}" cùng toàn bộ chương, nguồn canon và Story Bible? Hành động này không hoàn tác được.`
      )
    )
      return;
    await deleteStory(story.id);
    refresh();
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Viết truyện</h1>
          <p className="text-sm text-stone-500">
            Tạo truyện mới hoặc tiếp tục viết truyện đang dở.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          {showForm ? "Đóng form" : "+ Tạo truyện mới"}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={onCreate}
          className="mb-8 space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-semibold">
              Tên truyện *
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Đấu La: Con Đường Khác"
              className={inputCls}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold">
                Nguyên tác
              </label>
              <input
                value={originalWork}
                onChange={(e) => setOriginalWork(e.target.value)}
                placeholder="VD: Đấu La Đại Lục, Naruto..."
                className={inputCls}
                list="nguyen-tac-goi-y"
              />
              <datalist id="nguyen-tac-goi-y">
                <option value="Đấu La Đại Lục" />
                <option value="Cổ Chân Nhân" />
                <option value="Naruto" />
                <option value="Quỷ Bí Chi Chủ" />
              </datalist>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold">
                Trạng thái
              </label>
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
          <div>
            <label className="mb-1 block text-sm font-semibold">
              Giới thiệu
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Tóm tắt ngắn về truyện của bạn..."
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">
              Tag (cách nhau bằng dấu phẩy)
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="VD: đồng nhân, huyền huyễn, xuyên không"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold">
              Ảnh bìa
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onCoverChange(e.target.files?.[0])}
              className="text-sm"
            />
            <p className="mt-1 text-xs text-stone-500">
              Ảnh được thu nhỏ và lưu tạm trên trình duyệt. Sau khi nối Supabase
              Storage, ảnh bìa sẽ lưu lên cloud.
              {coverName ? ` Đã chọn: ${coverName}` : ""}
            </p>
            {coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={coverUrl}
                alt="Xem trước bìa"
                className="mt-2 h-36 w-24 rounded-lg object-cover"
              />
            )}
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {saving ? "Đang tạo..." : "Tạo truyện"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-stone-500">Đang tải...</p>
      ) : stories.length === 0 ? (
        <p className="text-sm text-stone-500">
          Chưa có truyện nào. Bấm “Tạo truyện mới” để bắt đầu.
        </p>
      ) : (
        <ul className="space-y-3">
          {stories.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/viet/${s.id}`}
                  className="font-bold hover:text-amber-700"
                >
                  {s.title}
                </Link>
                <p className="text-sm text-stone-500">
                  Nguyên tác: {s.originalWork || "—"}
                </p>
                <div className="mt-1">
                  <StatusBadge status={s.status} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/viet/${s.id}`}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold hover:border-amber-400"
                >
                  Viết tiếp
                </Link>
                <Link
                  href={`/truyen/${s.id}`}
                  className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold hover:border-amber-400"
                >
                  Xem
                </Link>
                <button
                  onClick={() => onDelete(s)}
                  className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
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
