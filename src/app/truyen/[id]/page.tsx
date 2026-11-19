"use client";

import {Suspense, useEffect, useState} from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getChapters, getStory } from "@/lib/data";
import { loadProgress } from "@/lib/store";
import type { Chapter, Story } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

function StoryDetailPageContent() {
  const params = useParams();
  const storyId = params.id as string;
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getStory(storyId);
      if (cancelled) return;
      if (!s) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setStory(s);
      setChapters(await getChapters(storyId));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  if (loading) return <p className="text-sm text-stone-500">Đang tải truyện...</p>;
  if (notFound || !story) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <p className="font-medium">Không tìm thấy truyện này.</p>
        <Link href="/" className="mt-3 inline-block text-sm text-amber-700 underline">
          Về trang chủ
        </Link>
      </div>
    );
  }

  const published = chapters.filter((c) => c.status === "xuat-ban");
  const drafts = chapters.filter((c) => c.status === "nhap");
  const progress = loadProgress()[storyId];
  const resumeChapter = progress
    ? published.find((c) => c.id === progress.chapterId)
    : undefined;

  return (
    <div>
      <div className="flex flex-wrap gap-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex h-52 w-36 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-stone-200 text-4xl">
          {story.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={story.coverUrl}
              alt={`Bìa ${story.title}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <span aria-hidden>📚</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{story.title}</h1>
          <p className="mt-1 text-sm text-stone-500">
            Nguyên tác: {story.originalWork || "—"}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={story.status} />
            <span className="text-xs text-stone-500">
              {published.length} chương đã xuất bản
              {drafts.length > 0 ? ` · ${drafts.length} nháp` : ""}
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
            {story.description || "Chưa có giới thiệu."}
          </p>
          {story.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {story.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {published.length > 0 && (
              <Link
                href={
                  resumeChapter
                    ? `/doc/${story.id}/${resumeChapter.id}`
                    : `/doc/${story.id}/${published[0].id}`
                }
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
              >
                {resumeChapter
                  ? `Đọc tiếp: Chương ${resumeChapter.number}`
                  : "Đọc từ đầu"}
              </Link>
            )}
            <Link
              href={`/viet/${story.id}`}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:border-amber-400"
            >
              ✏️ Viết / sửa
            </Link>
            <Link
              href={`/bible/${story.id}`}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:border-amber-400"
            >
              📕 Story Bible
            </Link>
            <Link
              href={`/nhap?story=${story.id}`}
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:border-amber-400"
            >
              📥 Nhập truyện gốc
            </Link>
          </div>
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-bold">Danh sách chương</h2>
      {published.length === 0 ? (
        <p className="text-sm text-stone-500">
          Chưa có chương nào được xuất bản. Vào trang Viết để thêm chương đầu tiên.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
          {published.map((c) => (
            <li key={c.id}>
              <Link
                href={`/doc/${story.id}/${c.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-amber-50"
              >
                <span className="min-w-0">
                  <span className="font-medium">
                    Chương {c.number}: {c.title}
                  </span>
                  {progress?.chapterId === c.id && (
                    <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                      Đang đọc dở
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-stone-400">
                  {c.wordCount.toLocaleString("vi-VN")} từ
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {drafts.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-bold">Bản nháp (chỉ bạn thấy)</h2>
          <ul className="divide-y divide-stone-200 rounded-xl border border-dashed border-stone-300 bg-white">
            {drafts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/viet/${story.id}/chuong/${c.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-amber-50"
                >
                  <span className="font-medium">
                    Chương {c.number}: {c.title || "(chưa đặt tên)"}
                  </span>
                  <span className="text-xs text-stone-400">Nháp · sửa tiếp</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function StoryDetailPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Đang tải...</p>}>
      <StoryDetailPageContent />
    </Suspense>
  );
}
