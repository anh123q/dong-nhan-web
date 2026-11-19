"use client";

import {Suspense, useEffect, useState} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  deleteBibleEntry,
  getBibleEntries,
  getStory,
  saveBibleEntry,
} from "@/lib/data";
import {
  BIBLE_TYPE_LABEL,
  type BibleEntry,
  type BibleEntryType,
  type Story,
} from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500";

const TYPE_ORDER: BibleEntryType[] = [
  "nhan-vat",
  "quy-tac",
  "timeline",
  "plot-thread",
];

const TYPE_HINT: Record<BibleEntryType, string> = {
  "nhan-vat":
    "VD: tên, tuổi, ngoại hình, tính cách, võ hồn/khả năng, quan hệ với ai.",
  "quy-tac":
    "VD: luật sức mạnh, cấp bậc, địa lý, quy tắc không được phá vỡ.",
  timeline: "VD: mốc thời gian quan trọng, sự kiện xảy ra trước/sau nhau.",
  "plot-thread":
    "VD: tuyến truyện đang mở, bí ẩn chưa giải, lời hứa chưa thực hiện.",
};

function BiblePageContent() {
  const params = useParams();
  const storyId = params.storyId as string;

  const [story, setStory] = useState<Story | null>(null);
  const [entries, setEntries] = useState<BibleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeType, setActiveType] = useState<BibleEntryType>("nhan-vat");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formRelated, setFormRelated] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    setEntries(await getBibleEntries(storyId));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getStory(storyId);
      if (cancelled) return;
      setStory(s);
      await refresh();
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyId]);

  const startNew = (type: BibleEntryType) => {
    setActiveType(type);
    setEditingId("new");
    setFormTitle("");
    setFormContent("");
    setFormRelated("");
    setError("");
  };

  const startEdit = (entry: BibleEntry) => {
    setActiveType(entry.type);
    setEditingId(entry.id);
    setFormTitle(entry.title);
    setFormContent(entry.content);
    setFormRelated(entry.relatedCharacters ?? "");
    setError("");
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) {
      setError("Hãy nhập đủ tiêu đề và nội dung.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await saveBibleEntry({
        id: editingId === "new" ? undefined : (editingId ?? undefined),
        storyId,
        type: activeType,
        title: formTitle.trim(),
        content: formContent.trim(),
        relatedCharacters:
          activeType === "nhan-vat" ? formRelated.trim() || undefined : undefined,
      });
      setEditingId(null);
      await refresh();
      // Lập chỉ mục RAG cho mục Bible mới/sửa (chạy nền, lỗi thì bỏ qua).
      void fetch("/api/ai/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId,
          sourceType: "bible",
          sourceId: saved.id,
          title: saved.title,
          content: `${saved.title}\n${saved.content}`,
        }),
      }).catch(() => undefined);
    } catch {
      setError("Không lưu được, hãy thử lại.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (entry: BibleEntry) => {
    if (!window.confirm(`Xóa mục "${entry.title}"?`)) return;
    await deleteBibleEntry(entry.id);
    // Xóa luôn vector của mục này để AI không đối chiếu với mục đã xóa.
    void fetch(
      `/api/ai/index?sourceType=bible&sourceId=${encodeURIComponent(entry.id)}`,
      { method: "DELETE" }
    ).catch(() => undefined);
    refresh();
  };

  if (loading) return <p className="text-sm text-stone-500">Đang tải...</p>;
  if (!story) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <p className="font-medium">Không tìm thấy truyện này.</p>
        <Link href="/" className="mt-3 inline-block text-sm text-amber-700 underline">
          Về trang chủ
        </Link>
      </div>
    );
  }

  const visible = entries.filter((e) => e.type === activeType);

  return (
    <div>
      <Link
        href={`/truyen/${storyId}`}
        className="text-sm text-amber-700 hover:underline"
      >
        ← {story.title}
      </Link>
      <h1 className="mt-1 text-2xl font-bold">📕 Story Bible</h1>
      <p className="mt-1 max-w-2xl text-sm text-stone-500">
        Đây là “luật” của truyện: nhân vật, quy tắc thế giới, timeline và các
        plot thread đang mở. AI kiểm tra mâu thuẫn sẽ đối chiếu chương mới với
        những mục này, nên càng ghi rõ thì AI càng kiểm tra chính xác.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {TYPE_ORDER.map((t) => {
          const count = entries.filter((e) => e.type === t).length;
          return (
            <button
              key={t}
              onClick={() => {
                setActiveType(t);
                setEditingId(null);
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
                activeType === t
                  ? "border-amber-600 bg-amber-50 text-amber-800"
                  : "border-stone-300 bg-white"
              }`}
            >
              {BIBLE_TYPE_LABEL[t]} ({count})
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-lg font-bold">{BIBLE_TYPE_LABEL[activeType]}</h2>
        <button
          onClick={() => startNew(activeType)}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          + Thêm mục
        </button>
      </div>

      {editingId && (
        <form
          onSubmit={onSave}
          className="mt-3 space-y-3 rounded-xl border border-amber-300 bg-amber-50/50 p-4"
        >
          <p className="text-xs text-stone-500">
            {editingId === "new" ? "Mục mới" : "Đang sửa"} ·{" "}
            {BIBLE_TYPE_LABEL[activeType]} — {TYPE_HINT[activeType]}
          </p>
          <input
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder={
              activeType === "nhan-vat"
                ? "Tên nhân vật (VD: Lâm Phong)"
                : "Tiêu đề mục"
            }
            className={inputCls}
          />
          <textarea
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            rows={4}
            placeholder="Ghi chi tiết, càng cụ thể càng tốt..."
            className={inputCls}
          />
          {activeType === "nhan-vat" && (
            <input
              value={formRelated}
              onChange={(e) => setFormRelated(e.target.value)}
              placeholder="Nhân vật liên quan (VD: Đường Tam, Tiểu Vũ)"
              className={inputCls}
            />
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? "Đang lưu..." : "Lưu mục"}
            </button>
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold"
            >
              Hủy
            </button>
          </div>
        </form>
      )}

      <ul className="mt-4 space-y-3">
        {visible.length === 0 && !editingId && (
          <li className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            Chưa có mục nào. Bấm “Thêm mục” để ghi mục đầu tiên.
          </li>
        )}
        {visible.map((entry) => (
          <li
            key={entry.id}
            className="rounded-xl border border-stone-200 bg-white px-4 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">{entry.title}</p>
                {entry.relatedCharacters && (
                  <p className="text-xs text-stone-500">
                    Liên quan: {entry.relatedCharacters}
                  </p>
                )}
                <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">
                  {entry.content}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => startEdit(entry)}
                  className="rounded-lg border border-stone-300 px-3 py-1 text-sm font-semibold hover:border-amber-400"
                >
                  Sửa
                </button>
                <button
                  onClick={() => onDelete(entry)}
                  className="rounded-lg border border-red-200 px-3 py-1 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Xóa
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function BiblePage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Đang tải...</p>}>
      <BiblePageContent />
    </Suspense>
  );
}
