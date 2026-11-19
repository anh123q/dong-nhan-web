// Lớp dữ liệu duy nhất mà các trang được phép gọi.
// Nếu đã cấu hình Supabase (đủ 2 biến môi trường) thì đọc/ghi Supabase,
// nếu không thì fallback về localStorage. Lỗi Supabase cũng fallback về
// local để web không bao giờ crash vì chưa có cloud.

import { isSupabaseConfigured, supabase } from "./supabase";
import {
  countWords,
  loadArcSummary,
  loadDb,
  newId,
  nowIso,
  saveArcSummaryLocal,
  saveDb,
} from "./store";
import type {
  BibleEntry,
  CanonSource,
  Chapter,
  ChapterSummary,
  Story,
} from "./types";

export function getStorageMode(): "supabase" | "local" {
  return isSupabaseConfigured ? "supabase" : "local";
}

function warnFallback(where: string, err: unknown) {
  console.warn(`[data] Supabase lỗi ở ${where}, dùng dữ liệu local:`, err);
}

// ---------- Kiểu hàng Supabase (snake_case) ----------

interface StoryRow {
  id: string;
  title: string;
  original_work: string;
  description: string;
  cover_url: string | null;
  tags: string[] | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface ChapterRow {
  id: string;
  story_id: string;
  number: number;
  title: string;
  content: string;
  status: string;
  summary: string | null;
  word_count: number;
  created_at: string;
  updated_at: string;
}

interface CanonRow {
  id: string;
  story_id: string;
  title: string;
  source_type: string;
  source_url: string | null;
  content: string;
  char_count: number;
  created_at: string;
}

interface BibleRow {
  id: string;
  story_id: string;
  type: string;
  title: string;
  content: string;
  related_characters: string | null;
  created_at: string;
  updated_at: string;
}

interface SummaryRow {
  id: string;
  chapter_id: string;
  story_id: string;
  summary: string;
  created_at: string;
}

// ---------- Chuyển đổi snake_case <-> camelCase ----------

const storyFromRow = (r: StoryRow): Story => ({
  id: r.id,
  title: r.title,
  originalWork: r.original_work,
  description: r.description ?? "",
  coverUrl: r.cover_url ?? undefined,
  tags: r.tags ?? [],
  status: r.status as Story["status"],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const storyToRow = (s: Story) => ({
  id: s.id,
  title: s.title,
  original_work: s.originalWork,
  description: s.description,
  cover_url: s.coverUrl ?? null,
  tags: s.tags,
  status: s.status,
  created_at: s.createdAt,
  updated_at: s.updatedAt,
});

const chapterFromRow = (r: ChapterRow): Chapter => ({
  id: r.id,
  storyId: r.story_id,
  number: r.number,
  title: r.title,
  content: r.content ?? "",
  status: r.status as Chapter["status"],
  summary: r.summary ?? undefined,
  wordCount: r.word_count ?? 0,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const chapterToRow = (c: Chapter) => ({
  id: c.id,
  story_id: c.storyId,
  number: c.number,
  title: c.title,
  content: c.content,
  status: c.status,
  summary: c.summary ?? null,
  word_count: c.wordCount,
  created_at: c.createdAt,
  updated_at: c.updatedAt,
});

const canonFromRow = (r: CanonRow): CanonSource => ({
  id: r.id,
  storyId: r.story_id,
  title: r.title,
  sourceType: r.source_type as CanonSource["sourceType"],
  sourceUrl: r.source_url ?? undefined,
  content: r.content ?? "",
  charCount: r.char_count ?? 0,
  createdAt: r.created_at,
});

const canonToRow = (c: CanonSource) => ({
  id: c.id,
  story_id: c.storyId,
  title: c.title,
  source_type: c.sourceType,
  source_url: c.sourceUrl ?? null,
  content: c.content,
  char_count: c.charCount,
  created_at: c.createdAt,
});

const bibleFromRow = (r: BibleRow): BibleEntry => ({
  id: r.id,
  storyId: r.story_id,
  type: r.type as BibleEntry["type"],
  title: r.title,
  content: r.content ?? "",
  relatedCharacters: r.related_characters ?? undefined,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const bibleToRow = (b: BibleEntry) => ({
  id: b.id,
  story_id: b.storyId,
  type: b.type,
  title: b.title,
  content: b.content,
  related_characters: b.relatedCharacters ?? null,
  created_at: b.createdAt,
  updated_at: b.updatedAt,
});

const summaryFromRow = (r: SummaryRow): ChapterSummary => ({
  id: r.id,
  chapterId: r.chapter_id,
  storyId: r.story_id,
  summary: r.summary,
  createdAt: r.created_at,
});

// ---------- Stories ----------

export async function getStories(): Promise<Story[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .order("updated_at", { ascending: false });
    if (!error && data) return (data as StoryRow[]).map(storyFromRow);
    warnFallback("getStories", error);
  }
  const db = loadDb();
  return [...db.stories].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  );
}

export async function getStory(id: string): Promise<Story | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from("stories")
      .select("*")
      .eq("id", id)
      .single();
    if (!error && data) return storyFromRow(data as StoryRow);
    warnFallback("getStory", error);
  }
  return loadDb().stories.find((s) => s.id === id) ?? null;
}

export async function createStory(
  input: Omit<Story, "id" | "createdAt" | "updatedAt">
): Promise<Story> {
  const t = nowIso();
  const story: Story = { ...input, id: newId(), createdAt: t, updatedAt: t };
  if (supabase) {
    const { error } = await supabase.from("stories").insert(storyToRow(story));
    if (!error) return story;
    warnFallback("createStory", error);
  }
  const db = loadDb();
  db.stories.unshift(story);
  saveDb(db);
  return story;
}

export async function updateStory(
  id: string,
  patch: Partial<Story>
): Promise<Story | null> {
  const current = await getStory(id);
  if (!current) return null;
  const merged: Story = { ...current, ...patch, updatedAt: nowIso() };
  if (supabase) {
    const { data, error } = await supabase
      .from("stories")
      .update(storyToRow(merged))
      .eq("id", id)
      .select()
      .single();
    if (!error && data) return storyFromRow(data as StoryRow);
    warnFallback("updateStory", error);
  }
  const db = loadDb();
  const idx = db.stories.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  db.stories[idx] = { ...db.stories[idx], ...patch, updatedAt: nowIso() };
  saveDb(db);
  return db.stories[idx];
}

export async function deleteStory(id: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("stories").delete().eq("id", id);
    if (!error) return;
    warnFallback("deleteStory", error);
  }
  const db = loadDb();
  db.stories = db.stories.filter((s) => s.id !== id);
  db.chapters = db.chapters.filter((c) => c.storyId !== id);
  db.canonSources = db.canonSources.filter((c) => c.storyId !== id);
  db.bibleEntries = db.bibleEntries.filter((b) => b.storyId !== id);
  db.summaries = db.summaries.filter((s) => s.storyId !== id);
  saveDb(db);
}

// ---------- Chapters ----------

export async function getChapters(storyId: string): Promise<Chapter[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("chapters")
      .select("*")
      .eq("story_id", storyId)
      .order("number", { ascending: true });
    if (!error && data) return (data as ChapterRow[]).map(chapterFromRow);
    warnFallback("getChapters", error);
  }
  return loadDb()
    .chapters.filter((c) => c.storyId === storyId)
    .sort((a, b) => a.number - b.number);
}

export async function getChapter(id: string): Promise<Chapter | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from("chapters")
      .select("*")
      .eq("id", id)
      .single();
    if (!error && data) return chapterFromRow(data as ChapterRow);
    warnFallback("getChapter", error);
  }
  return loadDb().chapters.find((c) => c.id === id) ?? null;
}

/** Tạo chương mới hoặc cập nhật chương đã có (upsert theo id). */
export async function saveChapter(
  input: Omit<Chapter, "id" | "createdAt" | "updatedAt" | "wordCount"> & {
    id?: string;
  }
): Promise<Chapter> {
  const t = nowIso();
  const wordCount = countWords(input.content);
  const existing = input.id ? await getChapter(input.id) : null;
  const chapter: Chapter = existing
    ? { ...existing, ...input, wordCount, updatedAt: t }
    : { ...input, id: newId(), wordCount, createdAt: t, updatedAt: t };

  if (supabase) {
    const { error } = await supabase
      .from("chapters")
      .upsert(chapterToRow(chapter), { onConflict: "id" });
    if (!error) return chapter;
    warnFallback("saveChapter", error);
  }
  const db = loadDb();
  const idx = db.chapters.findIndex((c) => c.id === chapter.id);
  if (idx === -1) db.chapters.push(chapter);
  else db.chapters[idx] = chapter;
  // Cập nhật updatedAt của truyện để truyện mới viết nổi lên đầu trang chủ.
  const sIdx = db.stories.findIndex((s) => s.id === chapter.storyId);
  if (sIdx !== -1) db.stories[sIdx].updatedAt = t;
  saveDb(db);
  return chapter;
}

export async function deleteChapter(id: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("chapters").delete().eq("id", id);
    if (!error) return;
    warnFallback("deleteChapter", error);
  }
  const db = loadDb();
  db.chapters = db.chapters.filter((c) => c.id !== id);
  db.summaries = db.summaries.filter((s) => s.chapterId !== id);
  saveDb(db);
}

// ---------- Canon sources ----------

export async function getCanonSources(storyId: string): Promise<CanonSource[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("canon_sources")
      .select("*")
      .eq("story_id", storyId)
      .order("created_at", { ascending: false });
    if (!error && data) return (data as CanonRow[]).map(canonFromRow);
    warnFallback("getCanonSources", error);
  }
  return loadDb()
    .canonSources.filter((c) => c.storyId === storyId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createCanonSource(
  input: Omit<CanonSource, "id" | "createdAt" | "charCount">
): Promise<CanonSource> {
  const source: CanonSource = {
    ...input,
    id: newId(),
    charCount: input.content.length,
    createdAt: nowIso(),
  };
  if (supabase) {
    const { error } = await supabase
      .from("canon_sources")
      .insert(canonToRow(source));
    if (!error) return source;
    warnFallback("createCanonSource", error);
  }
  const db = loadDb();
  db.canonSources.unshift(source);
  saveDb(db);
  return source;
}

export async function deleteCanonSource(id: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase
      .from("canon_sources")
      .delete()
      .eq("id", id);
    if (!error) return;
    warnFallback("deleteCanonSource", error);
  }
  const db = loadDb();
  db.canonSources = db.canonSources.filter((c) => c.id !== id);
  saveDb(db);
}

// ---------- Bible entries ----------

export async function getBibleEntries(storyId: string): Promise<BibleEntry[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("bible_entries")
      .select("*")
      .eq("story_id", storyId)
      .order("created_at", { ascending: true });
    if (!error && data) return (data as BibleRow[]).map(bibleFromRow);
    warnFallback("getBibleEntries", error);
  }
  return loadDb()
    .bibleEntries.filter((b) => b.storyId === storyId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveBibleEntry(
  input: Omit<BibleEntry, "id" | "createdAt" | "updatedAt"> & { id?: string }
): Promise<BibleEntry> {
  const t = nowIso();
  const entry: BibleEntry = input.id
    ? { ...input, id: input.id, createdAt: "", updatedAt: t }
    : { ...input, id: newId(), createdAt: t, updatedAt: t };
  if (input.id) {
    // Giữ nguyên createdAt khi sửa.
    const db = loadDb();
    const old = db.bibleEntries.find((b) => b.id === input.id);
    if (old) entry.createdAt = old.createdAt;
    else entry.createdAt = t;
  }
  if (supabase) {
    const { error } = await supabase
      .from("bible_entries")
      .upsert(bibleToRow(entry), { onConflict: "id" });
    if (!error) return entry;
    warnFallback("saveBibleEntry", error);
  }
  const db = loadDb();
  const idx = db.bibleEntries.findIndex((b) => b.id === entry.id);
  if (idx === -1) db.bibleEntries.push(entry);
  else db.bibleEntries[idx] = entry;
  saveDb(db);
  return entry;
}

export async function deleteBibleEntry(id: string): Promise<void> {
  if (supabase) {
    const { error } = await supabase
      .from("bible_entries")
      .delete()
      .eq("id", id);
    if (!error) return;
    warnFallback("deleteBibleEntry", error);
  }
  const db = loadDb();
  db.bibleEntries = db.bibleEntries.filter((b) => b.id !== id);
  saveDb(db);
}

// ---------- Chapter summaries ----------

export async function getChapterSummaries(
  storyId: string
): Promise<ChapterSummary[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from("chapter_summaries")
      .select("*")
      .eq("story_id", storyId)
      .order("created_at", { ascending: true });
    if (!error && data) return (data as SummaryRow[]).map(summaryFromRow);
    warnFallback("getChapterSummaries", error);
  }
  return loadDb()
    .summaries.filter((s) => s.storyId === storyId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ---------- Tóm tắt arc tổng thể (1 đoạn cho mỗi truyện) ----------

export async function getArcSummary(storyId: string): Promise<string | null> {
  if (supabase) {
    const { data, error } = await supabase
      .from("story_summaries")
      .select("summary")
      .eq("story_id", storyId)
      .single();
    if (!error && data) return (data as { summary: string }).summary;
    if (error && error.code !== "PGRST116") {
      // PGRST116 = không có dòng nào (truyện chưa có tóm tắt arc) — bình thường.
      warnFallback("getArcSummary", error);
    }
  }
  return loadArcSummary(storyId);
}

export async function saveArcSummary(
  storyId: string,
  summary: string
): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("story_summaries").upsert(
      {
        story_id: storyId,
        summary,
        updated_at: nowIso(),
      },
      { onConflict: "story_id" }
    );
    if (!error) return;
    warnFallback("saveArcSummary", error);
  }
  saveArcSummaryLocal(storyId, summary);
}

export async function saveChapterSummary(
  storyId: string,
  chapterId: string,
  summary: string
): Promise<void> {
  if (supabase) {
    const { error } = await supabase.from("chapter_summaries").upsert(
      {
        chapter_id: chapterId,
        story_id: storyId,
        summary,
        created_at: nowIso(),
      },
      { onConflict: "chapter_id" }
    );
    if (!error) return;
    warnFallback("saveChapterSummary", error);
  }
  const db = loadDb();
  const idx = db.summaries.findIndex((s) => s.chapterId === chapterId);
  if (idx === -1) {
    db.summaries.push({
      id: newId(),
      chapterId,
      storyId,
      summary,
      createdAt: nowIso(),
    });
  } else {
    db.summaries[idx].summary = summary;
  }
  saveDb(db);
}
