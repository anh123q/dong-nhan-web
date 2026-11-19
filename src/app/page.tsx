"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getChapters, getStories } from "@/lib/data";
import type { Story } from "@/lib/types";
import StoryCard from "@/components/StoryCard";
import StorageBanner from "@/components/StorageBanner";

export default function HomePage() {
  const [stories, setStories] = useState<Story[]>([]);
  const [chapterCounts, setChapterCounts] = useState<Record<string, number>>(
    {}
  );
  const [latestChapters, setLatestChapters] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [originalFilter, setOriginalFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getStories();
      if (cancelled) return;
      setStories(list);
      // Đếm chương cho từng truyện (chỉ đếm chương đã xuất bản).
      const counts: Record<string, number> = {};
      const latest: Record<string, string> = {};
      for (const s of list) {
        const chapters = await getChapters(s.id);
        const published = chapters.filter((c) => c.status === "xuat-ban");
        counts[s.id] = published.length;
        if (published.length > 0) {
          const last = published[published.length - 1];
          latest[s.id] = `Chương ${last.number}: ${last.title}`;
        }
      }
      if (!cancelled) {
        setChapterCounts(counts);
        setLatestChapters(latest);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const originalWorks = useMemo(
    () => [...new Set(stories.map((s) => s.originalWork).filter(Boolean))],
    [stories]
  );
  const allTags = useMemo(
    () => [...new Set(stories.flatMap((s) => s.tags))].sort(),
    [stories]
  );

  const filtered = stories.filter((s) => {
    const q = query.trim().toLowerCase();
    if (q && !`${s.title} ${s.originalWork} ${s.description}`.toLowerCase().includes(q))
      return false;
    if (originalFilter && s.originalWork !== originalFilter) return false;
    if (tagFilter && !s.tags.includes(tagFilter)) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Truyện của tôi</h1>
          <p className="text-sm text-stone-500">
            Đọc, viết và phát triển truyện đồng nhân của riêng bạn.
          </p>
        </div>
        <Link
          href="/viet"
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          + Viết truyện mới
        </Link>
      </div>

      <StorageBanner />

      <div className="mb-5 flex flex-wrap gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên truyện, nguyên tác..."
          className="min-w-56 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
        <select
          value={originalFilter}
          onChange={(e) => setOriginalFilter(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          aria-label="Lọc theo nguyên tác"
        >
          <option value="">Mọi nguyên tác</option>
          {originalWorks.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
          aria-label="Lọc theo tag"
        >
          <option value="">Mọi tag</option>
          {allTags.map((t) => (
            <option key={t} value={t}>
              #{t}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-stone-500">Đang tải truyện...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center">
          <p className="font-medium">Chưa có truyện nào khớp.</p>
          <p className="mt-1 text-sm text-stone-500">
            Thử đổi từ khóa, hoặc tạo truyện mới để bắt đầu viết.
          </p>
          <Link
            href="/viet"
            className="mt-4 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Tạo truyện mới
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((s) => (
            <StoryCard
              key={s.id}
              story={s}
              chapterCount={chapterCounts[s.id] ?? 0}
              latestChapter={latestChapters[s.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
