import Link from "next/link";
import type { Story } from "@/lib/types";
import StatusBadge from "./StatusBadge";

export default function StoryCard({
  story,
  chapterCount,
  latestChapter,
}: {
  story: Story;
  chapterCount: number;
  latestChapter?: string;
}) {
  return (
    <Link
      href={`/truyen/${story.id}`}
      className="group flex gap-4 rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-amber-300 hover:shadow"
    >
      <div className="flex h-36 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-stone-200 text-3xl">
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
      <div className="min-w-0">
        <h3 className="truncate text-lg font-bold group-hover:text-amber-700">
          {story.title}
        </h3>
        <p className="text-sm text-stone-500">
          Nguyên tác: {story.originalWork || "—"}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <StatusBadge status={story.status} />
          <span className="text-xs text-stone-500">
            {chapterCount} chương
            {latestChapter ? ` · mới nhất: ${latestChapter}` : ""}
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-stone-600">
          {story.description || "Chưa có giới thiệu."}
        </p>
        {story.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
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
      </div>
    </Link>
  );
}
