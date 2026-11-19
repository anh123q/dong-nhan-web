import { STORY_STATUS_LABEL, type StoryStatus } from "@/lib/types";

const COLORS: Record<StoryStatus, string> = {
  "dang-viet": "bg-emerald-100 text-emerald-800",
  "tam-dung": "bg-amber-100 text-amber-800",
  "hoan-thanh": "bg-sky-100 text-sky-800",
};

export default function StatusBadge({ status }: { status: StoryStatus }) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${COLORS[status]}`}
    >
      {STORY_STATUS_LABEL[status]}
    </span>
  );
}
