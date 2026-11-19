"use client";

import {Suspense, useEffect, useMemo, useRef, useState} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getChapters, getStory } from "@/lib/data";
import { loadProgress, saveProgress } from "@/lib/store";
import type { Chapter, Story } from "@/lib/types";

type ReaderTheme = "sang" | "toi" | "nau";
type ReaderFont = "serif" | "sans";

const THEMES: Record<ReaderTheme, { bg: string; text: string; label: string }> = {
  sang: { bg: "#ffffff", text: "#1c1917", label: "Sáng" },
  toi: { bg: "#1c1917", text: "#e7e5e4", label: "Tối" },
  nau: { bg: "#f5ead6", text: "#3b2f1e", label: "Nâu nhạt" },
};

const READER_SETTINGS_KEY = "dongnhan-reader-settings-v1";

interface ReaderSettings {
  fontSize: number;
  font: ReaderFont;
  theme: ReaderTheme;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 19,
  font: "serif",
  theme: "sang",
};

function loadSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    // bỏ qua, dùng mặc định
  }
  return DEFAULT_SETTINGS;
}

function ReaderPageContent() {
  const params = useParams();
  const router = useRouter();
  const storyId = params.storyId as string;
  const chapterId = params.chapterId as string;

  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const restoredRef = useRef(false);

  const chapter = useMemo(
    () => chapters.find((c) => c.id === chapterId),
    [chapters, chapterId]
  );
  const published = useMemo(
    () => chapters.filter((c) => c.status === "xuat-ban"),
    [chapters]
  );
  const currentIndex = published.findIndex((c) => c.id === chapterId);
  const prev = currentIndex > 0 ? published[currentIndex - 1] : undefined;
  const next =
    currentIndex >= 0 && currentIndex < published.length - 1
      ? published[currentIndex + 1]
      : undefined;

  useEffect(() => {
    setSettings(loadSettings());
    let cancelled = false;
    (async () => {
      const s = await getStory(storyId);
      if (cancelled) return;
      setStory(s);
      setChapters(await getChapters(storyId));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  // Khôi phục vị trí cuộn khi mở lại chương đang đọc dở.
  useEffect(() => {
    if (!chapter || restoredRef.current) return;
    restoredRef.current = true;
    const p = loadProgress()[storyId];
    if (p && p.chapterId === chapterId && p.scrollY > 0) {
      window.setTimeout(() => window.scrollTo(0, p.scrollY), 100);
    } else {
      window.scrollTo(0, 0);
    }
  }, [chapter, storyId, chapterId]);

  // Lưu vị trí đang đọc khi cuộn (throttle 500ms).
  useEffect(() => {
    if (!chapter) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        saveProgress({
          storyId,
          chapterId,
          scrollY: window.scrollY,
          updatedAt: new Date().toISOString(),
        });
      }, 500);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (timer) clearTimeout(timer);
    };
  }, [chapter, storyId, chapterId]);

  const updateSettings = (patch: Partial<ReaderSettings>) => {
    setSettings((prevSettings) => {
      const nextSettings = { ...prevSettings, ...patch };
      try {
        localStorage.setItem(
          READER_SETTINGS_KEY,
          JSON.stringify(nextSettings)
        );
      } catch {
        // bỏ qua khi localStorage đầy
      }
      return nextSettings;
    });
  };

  if (loading) return <p className="text-sm text-stone-500">Đang tải chương...</p>;
  if (!story || !chapter) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <p className="font-medium">Không tìm thấy chương này.</p>
        <Link href="/" className="mt-3 inline-block text-sm text-amber-700 underline">
          Về trang chủ
        </Link>
      </div>
    );
  }

  const theme = THEMES[settings.theme];

  const navButtons = (
    <div className="flex items-center justify-between gap-3">
      {prev ? (
        <button
          onClick={() => router.push(`/doc/${storyId}/${prev.id}`)}
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:border-amber-400"
        >
          ← Chương {prev.number}
        </button>
      ) : (
        <span />
      )}
      <Link
        href={`/truyen/${storyId}`}
        className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold hover:border-amber-400"
      >
        Mục lục
      </Link>
      {next ? (
        <button
          onClick={() => router.push(`/doc/${storyId}/${next.id}`)}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
        >
          Chương {next.number} →
        </button>
      ) : (
        <span />
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/truyen/${storyId}`}
            className="text-sm text-amber-700 hover:underline"
          >
            {story.title}
          </Link>
          <h1 className="text-xl font-bold">
            Chương {chapter.number}: {chapter.title}
          </h1>
          <p className="text-xs text-stone-500">
            {chapter.wordCount.toLocaleString("vi-VN")} từ · vị trí đọc được tự
            động lưu
          </p>
        </div>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold hover:border-amber-400"
          aria-expanded={showSettings}
        >
          ⚙️ Cài đặt đọc
        </button>
      </div>

      {showSettings && (
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-stone-200 bg-white p-4 text-sm">
          <label className="flex items-center gap-2">
            Cỡ chữ:
            <input
              type="range"
              min={15}
              max={26}
              value={settings.fontSize}
              onChange={(e) =>
                updateSettings({ fontSize: Number(e.target.value) })
              }
              aria-label="Cỡ chữ"
            />
            <span className="w-10 text-stone-500">{settings.fontSize}px</span>
          </label>
          <label className="flex items-center gap-2">
            Font:
            <select
              value={settings.font}
              onChange={(e) =>
                updateSettings({ font: e.target.value as ReaderFont })
              }
              className="rounded-lg border border-stone-300 px-2 py-1"
            >
              <option value="serif">Serif (có chân)</option>
              <option value="sans">Sans (không chân)</option>
            </select>
          </label>
          <div className="flex items-center gap-2">
            Nền:
            {(Object.keys(THEMES) as ReaderTheme[]).map((t) => (
              <button
                key={t}
                onClick={() => updateSettings({ theme: t })}
                className={`rounded-lg border px-3 py-1 text-sm ${
                  settings.theme === t
                    ? "border-amber-600 bg-amber-50 font-semibold"
                    : "border-stone-300"
                }`}
              >
                {THEMES[t].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {navButtons}

      <article
        className="reader-body my-6 rounded-xl border border-stone-200 px-5 py-8 shadow-sm sm:px-10"
        style={{
          backgroundColor: theme.bg,
          color: theme.text,
          fontSize: `${settings.fontSize}px`,
          fontFamily:
            settings.font === "serif"
              ? "Georgia, 'Times New Roman', serif"
              : "'Segoe UI', system-ui, sans-serif",
        }}
      >
        {chapter.content
          .split(/\n\s*\n/)
          .filter((p) => p.trim())
          .map((para, i) => (
            <p key={i}>{para.trim()}</p>
          ))}
      </article>

      {navButtons}
    </div>
  );
}

export default function ReaderPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Đang tải...</p>}>
      <ReaderPageContent />
    </Suspense>
  );
}
