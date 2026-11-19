"use client";

import {Suspense, useCallback, useEffect, useRef, useState} from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  getArcSummary,
  getBibleEntries,
  getCanonSources,
  getChapter,
  getChapters,
  getStorageMode,
  getStory,
  saveArcSummary,
  saveChapter,
  saveChapterSummary,
} from "@/lib/data";
import { chunkText, rankChunksByKeywords } from "@/lib/chunks";
import { countWords } from "@/lib/store";
import type {
  AiCheckResult,
  AiContinueResult,
  AiSuggestResult,
  BibleEntry,
  CanonSource,
  Chapter,
  Contradiction,
  PlotSuggestion,
  RetrievedChunk,
  Story,
  StructuredSummary,
} from "@/lib/types";

const inputCls =
  "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500";

type SaveState = "idle" | "saving" | "saved" | "error";

const SEVERITY_STYLE: Record<Contradiction["severity"], string> = {
  cao: "border-red-300 bg-red-50",
  "trung-binh": "border-amber-300 bg-amber-50",
  thap: "border-stone-300 bg-stone-50",
};

const SEVERITY_LABEL: Record<Contradiction["severity"], string> = {
  cao: "Nghiêm trọng",
  "trung-binh": "Trung bình",
  thap: "Nhẹ",
};

function ChapterEditorPageContent() {
  const params = useParams();
  const router = useRouter();
  const storyId = params.storyId as string;
  const chapterId = params.chapterId as string;

  const [story, setStory] = useState<Story | null>(null);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [bible, setBible] = useState<BibleEntry[]>([]);
  const [previousSummaries, setPreviousSummaries] = useState<
    Array<{ number: number; title: string; summary: string }>
  >([]);
  // Chương trước (đủ nội dung) + nguồn canon: để tìm đoạn liên quan bằng
  // từ khóa khi ở chế độ local (chưa nối Supabase nên không có vector).
  const [previousChapters, setPreviousChapters] = useState<Chapter[]>([]);
  const [canonSources, setCanonSources] = useState<CanonSource[]>([]);
  const [arcSummary, setArcSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [summary, setSummary] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [summarizeStatus, setSummarizeStatus] = useState("");

  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<AiCheckResult | null>(null);
  const [checkError, setCheckError] = useState("");

  const [suggesting, setSuggesting] = useState(false);
  const [suggestResult, setSuggestResult] = useState<AiSuggestResult | null>(null);
  const [suggestError, setSuggestError] = useState("");

  const [continuing, setContinuing] = useState(false);
  const [continueResult, setContinueResult] = useState<AiContinueResult | null>(null);
  const [continueError, setContinueError] = useState("");
  const [direction, setDirection] = useState("");
  const [targetWords, setTargetWords] = useState(600);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ title, content, summary });
  latestRef.current = { title, content, summary };
  // Ref luôn trỏ tới chương mới nhất: doSave đọc trạng thái từ đây thay
  // vì closure, tránh lưu đè trạng thái cũ khi 2 lần lưu chạy chồng nhau
  // (lỗi thực tế: chương vừa xuất bản tự quay về Nháp).
  const chapterRef = useRef<Chapter | null>(null);
  chapterRef.current = chapter;
  // Số thứ tự lần lưu: lần lưu cũ resolve muộn thì bỏ qua, không được
  // ghi đè state của lần lưu mới hơn.
  const saveSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, c, b, allChapters, canon, arc] = await Promise.all([
        getStory(storyId),
        getChapter(chapterId),
        getBibleEntries(storyId),
        getChapters(storyId),
        getCanonSources(storyId),
        getArcSummary(storyId),
      ]);
      if (cancelled) return;
      setStory(s);
      setChapter(c);
      setBible(b);
      setCanonSources(canon);
      setArcSummary(arc);
      if (c) {
        setTitle(c.title);
        setContent(c.content);
        setSummary(c.summary ?? "");
        const prev = allChapters.filter((ch) => ch.number < c.number);
        setPreviousChapters(prev);
        setPreviousSummaries(
          prev
            .filter((ch) => ch.summary)
            .map((ch) => ({
              number: ch.number,
              title: ch.title,
              summary: ch.summary as string,
            }))
        );
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId, chapterId]);

  const doSave = useCallback(
    async (status?: Chapter["status"]) => {
      const ch = chapterRef.current;
      if (!ch) return;
      const seq = ++saveSeqRef.current;
      setSaveState("saving");
      try {
        const { title: t, content: c, summary: s } = latestRef.current;
        const saved = await saveChapter({
          id: ch.id,
          storyId,
          number: ch.number,
          title: t,
          content: c,
          summary: s.trim() || undefined,
          status: status ?? ch.status,
        });
        // Chỉ lần lưu mới nhất mới được cập nhật state.
        if (seq !== saveSeqRef.current) return;
        setChapter(saved);
        setSaveState("saved");
        setSavedAt(new Date().toLocaleTimeString("vi-VN"));
      } catch {
        if (seq !== saveSeqRef.current) return;
        setSaveState("error");
      }
    },
    [storyId]
  );

  // Tự lưu nháp sau 1 giây ngừng gõ. Chỉ chạy khi nội dung đổi — không
  // phụ thuộc chapter/doSave để tránh vòng lưu lặp mỗi giây.
  useEffect(() => {
    if (loading || !chapter) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void doSave(), 1000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, summary, loading]);

  const onPublish = async () => {
    setPublishing(true);
    await doSave("xuat-ban");
    setPublishing(false);
    // Sau khi xuất bản: tự tạo tóm tắt AI + lập chỉ mục RAG cho chương.
    // Chạy nền, lỗi thì chỉ báo 1 dòng — chương vẫn xuất bản bình thường.
    void runPostPublish();
  };

  /** Tóm tắt chương bằng AI rồi lập chỉ mục vector (sau khi xuất bản). */
  const runPostPublish = async () => {
    if (!chapter) return;
    const { title: t, content: c } = latestRef.current;
    if (!c.trim()) return;
    setSummarizeStatus("Đang tạo tóm tắt AI cho chương vừa xuất bản...");
    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId,
          chapterNumber: chapter.number,
          chapterTitle: t,
          chapterContent: c,
          previousArcSummary: arcSummary,
        }),
      });
      const data = (await res.json()) as {
        summary?: StructuredSummary;
        arcSummary?: string;
        error?: string;
      };
      if (!res.ok || !data.summary) {
        setSummarizeStatus(
          `Không tạo được tóm tắt AI (${data.error ?? `lỗi ${res.status}`}). Chương vẫn xuất bản bình thường — bạn có thể tự ghi tóm tắt tay ở ô bên trên.`
        );
      } else {
        await saveChapterSummary(
          storyId,
          chapter.id,
          JSON.stringify(data.summary)
        );
        // Đồng bộ state với bản vừa lưu để nút xuất bản không quay về Nháp.
        const savedChapter = await saveChapter({
          id: chapter.id,
          storyId,
          number: chapter.number,
          title: t,
          content: c,
          summary: data.summary.oneLine,
          status: "xuat-ban",
        });
        setChapter(savedChapter);
        if (data.arcSummary) {
          await saveArcSummary(storyId, data.arcSummary);
          setArcSummary(data.arcSummary);
        }
        setSummary(data.summary.oneLine);
        setSummarizeStatus("Đã tạo tóm tắt AI cho chương này ✓");
      }
    } catch {
      setSummarizeStatus(
        "Không gọi được API tóm tắt — chương vẫn xuất bản bình thường."
      );
    }
    // Lập chỉ mục vector để các chương sau đối chiếu được với chương này.
    // Lỗi thì bỏ qua lặng (chế độ local vốn không có vector).
    try {
      await fetch("/api/ai/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storyId,
          sourceType: "chapter",
          sourceId: chapter.id,
          title: t,
          content: c,
        }),
      });
    } catch {
      // Bỏ qua — không ảnh hưởng tới việc xuất bản.
    }
  };

  const onUnpublish = async () => {
    await doSave("nhap");
  };

  /**
   * Chế độ local (chưa nối Supabase → không có vector): tìm đoạn liên
   * quan bằng từ khóa ngay trên trình duyệt để gửi kèm cho AI.
   * Chế độ Supabase: server tự truy xuất vector, hàm này trả undefined.
   */
  const buildLocalContext = (): RetrievedChunk[] | undefined => {
    if (getStorageMode() !== "local") return undefined;
    const candidates: Array<{
      label: string;
      sourceType: RetrievedChunk["sourceType"];
      text: string;
    }> = [];
    for (const ch of previousChapters) {
      for (const chunk of chunkText(ch.content)) {
        candidates.push({
          label: `Chương ${ch.number} — ${ch.title} (đoạn ${chunk.index + 1})`,
          sourceType: "chapter",
          text: chunk.text,
        });
      }
    }
    for (const src of canonSources) {
      for (const chunk of chunkText(src.content)) {
        candidates.push({
          label: `Canon: ${src.title} (đoạn ${chunk.index + 1})`,
          sourceType: "canon",
          text: chunk.text,
        });
      }
    }
    for (const b of bible) {
      candidates.push({
        label: `Bible: ${b.title}`,
        sourceType: "bible",
        text: `${b.title}\n${b.content}`,
      });
    }
    // Giới hạn 400 chunk để việc xếp hạng không chậm trên máy yếu.
    return rankChunksByKeywords(
      latestRef.current.content,
      candidates.slice(0, 400),
      8
    );
  };

  /** Body chung cho các API AI: Bible + tóm tắt + ngữ cảnh RAG. */
  const aiContextBody = () => ({
    storyId,
    chapterId: chapter?.id,
    storyTitle: story?.title,
    originalWork: story?.originalWork,
    chapterTitle: latestRef.current.title,
    chapterNumber: chapter?.number,
    chapterContent: latestRef.current.content,
    bible,
    previousSummaries,
    arcSummary: arcSummary ?? undefined,
    retrievedContext: buildLocalContext(),
  });

  const onCheck = async () => {
    if (!chapter || !story) return;
    setChecking(true);
    setCheckError("");
    setCheckResult(null);
    // Lưu nháp trước khi kiểm tra để AI đọc đúng bản mới nhất.
    await doSave();
    try {
      const res = await fetch("/api/ai/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiContextBody()),
      });
      const data = (await res.json()) as AiCheckResult & { error?: string };
      if (!res.ok) {
        setCheckError(data.error ?? `Lỗi ${res.status}`);
        return;
      }
      setCheckResult(data);
    } catch {
      setCheckError("Không gọi được API kiểm tra. Hãy kiểm tra server đang chạy.");
    } finally {
      setChecking(false);
    }
  };

  const onSuggest = async () => {
    if (!chapter || !story) return;
    setSuggesting(true);
    setSuggestError("");
    setSuggestResult(null);
    await doSave();
    try {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...aiContextBody(), count: 3 }),
      });
      const data = (await res.json()) as AiSuggestResult & { error?: string };
      if (!res.ok) {
        setSuggestError(data.error ?? `Lỗi ${res.status}`);
        return;
      }
      setSuggestResult(data);
    } catch {
      setSuggestError("Không gọi được API gợi ý. Hãy kiểm tra server đang chạy.");
    } finally {
      setSuggesting(false);
    }
  };

  /** Chọn 1 gợi ý làm hướng viết tiếp: điền vào ô hướng viết bên dưới. */
  const applySuggestion = (s: PlotSuggestion) => {
    setDirection(`${s.title}: ${s.summary}`);
    setContinueResult(null);
    setContinueError("");
  };

  const onContinue = async () => {
    if (!chapter || !story) return;
    setContinuing(true);
    setContinueError("");
    setContinueResult(null);
    await doSave();
    try {
      const res = await fetch("/api/ai/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...aiContextBody(),
          direction: direction.trim() || undefined,
          targetWords,
        }),
      });
      const data = (await res.json()) as AiContinueResult & { error?: string };
      if (!res.ok) {
        setContinueError(data.error ?? `Lỗi ${res.status}`);
        return;
      }
      setContinueResult(data);
    } catch {
      setContinueError("Không gọi được API viết tiếp. Hãy kiểm tra server đang chạy.");
    } finally {
      setContinuing(false);
    }
  };

  /** Chèn đoạn AI viết tiếp vào cuối chương — chỉ khi user bấm nút này. */
  const insertContinuation = () => {
    if (!continueResult) return;
    setContent((prev) =>
      prev.trimEnd() ? `${prev.trimEnd()}\n\n${continueResult.continuation}` : continueResult.continuation
    );
    setContinueResult(null);
  };

  if (loading) return <p className="text-sm text-stone-500">Đang tải chương...</p>;
  if (!story || !chapter) {
    return (
      <div className="rounded-xl border bg-white p-8 text-center">
        <p className="font-medium">Không tìm thấy chương này.</p>
        <button
          onClick={() => router.push(`/viet/${storyId}`)}
          className="mt-3 text-sm text-amber-700 underline"
        >
          Về trang sửa truyện
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            onClick={() => {
              // Xóa cache điều hướng rồi mới quay về, để trang truyện
              // tải lại danh sách chương mới nhất thay vì bản cũ.
              router.refresh();
              router.push(`/viet/${storyId}`);
            }}
            className="text-sm text-amber-700 hover:underline"
          >
            ← {story.title}
          </button>
          <h1 className="text-xl font-bold">Chương {chapter.number}</h1>
          <p className="text-xs text-stone-500">
            {saveState === "saving" && "Đang lưu nháp..."}
            {saveState === "saved" && `Đã lưu nháp lúc ${savedAt}`}
            {saveState === "error" && (
              <span className="text-red-600">Lưu thất bại, hãy thử lại.</span>
            )}
            {saveState === "idle" && "Tự lưu nháp sau 1 giây ngừng gõ"}
            {" · "}
            {countWords(content).toLocaleString("vi-VN")} từ
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {chapter.status === "xuat-ban" ? (
            <>
              <button
                onClick={onUnpublish}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold hover:border-amber-400"
              >
                Gỡ xuống nháp
              </button>
              <Link
                href={`/doc/${storyId}/${chapter.id}`}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold hover:border-amber-400"
              >
                Xem bản đọc
              </Link>
            </>
          ) : (
            <button
              onClick={onPublish}
              disabled={publishing}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {publishing ? "Đang xuất bản..." : "Xuất bản chương"}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-semibold">
            Tiêu đề chương
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Khởi đầu mới"
            className={inputCls}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">
            Nội dung chương
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={22}
            placeholder="Viết chương của bạn ở đây..."
            className={`${inputCls} font-serif leading-relaxed`}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold">
            Tóm tắt chương (tùy chọn)
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            placeholder="Tóm tắt 2-3 dòng: chương này xảy ra chuyện gì? AI dùng tóm tắt này để kiểm tra các chương sau. Khi xuất bản, AI sẽ tự tạo tóm tắt này nếu bạn để trống."
            className={inputCls}
          />
          {summarizeStatus && (
            <p className="mt-1 text-xs text-stone-500">{summarizeStatus}</p>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">🔍 Kiểm tra mâu thuẫn bằng AI</h2>
            <p className="text-sm text-stone-500">
              AI đối chiếu chương này với Story Bible ({bible.length} mục),
              tóm tắt {previousSummaries.length} chương trước và các đoạn
              canon/chương liên quan nhất (RAG
              {getStorageMode() === "supabase"
                ? " — tìm bằng vector"
                : " — tìm bằng từ khóa, nối Supabase để tìm bằng vector"}
              ).
            </p>
          </div>
          <button
            onClick={onCheck}
            disabled={checking || !content.trim()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {checking ? "Đang kiểm tra..." : "Kiểm tra ngay"}
          </button>
        </div>

        {checkError && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {checkError}
          </p>
        )}

        {checkResult && (
          <div className="mt-4">
            {checkResult.retrieval && (
              <p className="mb-3 text-xs text-stone-500">
                Đã đối chiếu với {checkResult.retrieval.count} đoạn liên quan
                nhất
                {checkResult.retrieval.mode === "vector"
                  ? " (tìm bằng vector trên Supabase)"
                  : checkResult.retrieval.mode === "keyword"
                    ? " (tìm bằng từ khóa trên trình duyệt)"
                    : " — không tìm thấy đoạn nào, chỉ đối chiếu Bible + tóm tắt"}
                . Kiểm tra bằng {checkResult.model}.
              </p>
            )}
            {checkResult.contradictions.length === 0 ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                ✅ Không phát hiện mâu thuẫn với Story Bible và các chương trước.
              </p>
            ) : (
              <ul className="space-y-3">
                {checkResult.contradictions.map((c, i) => (
                  <li
                    key={i}
                    className={`rounded-lg border px-4 py-3 ${SEVERITY_STYLE[c.severity]}`}
                  >
                    <p className="font-semibold">
                      <span className="mr-2 rounded-full bg-white/70 px-2 py-0.5 text-xs">
                        {SEVERITY_LABEL[c.severity]}
                      </span>
                      {c.category}: {c.description}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">Bằng chứng: </span>
                      {c.evidence}
                    </p>
                    <p className="mt-1 text-sm">
                      <span className="font-medium">Gợi ý sửa: </span>
                      {c.suggestion}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">💡 Gợi ý cốt truyện bằng AI</h2>
            <p className="text-sm text-stone-500">
              AI đề xuất 3 hướng phát triển khác nhau cho chương tiếp theo,
              dựa trên Story Bible, tóm tắt các chương trước và plot thread
              đang mở. Chọn 1 hướng rồi bấm viết tiếp bên dưới.
            </p>
          </div>
          <button
            onClick={onSuggest}
            disabled={suggesting}
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {suggesting ? "Đang nghĩ hướng..." : "Gợi ý hướng phát triển"}
          </button>
        </div>

        {suggestError && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {suggestError}
          </p>
        )}

        {suggestResult && (
          <div className="mt-4">
            <p className="mb-3 text-xs text-stone-500">
              Gợi ý bằng {suggestResult.model}
              {suggestResult.retrieval
                ? `, đối chiếu với ${suggestResult.retrieval.count} đoạn liên quan nhất.`
                : "."}
            </p>
            {suggestResult.suggestions.length === 0 ? (
              <p className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                AI chưa gợi ý được hướng nào — hãy thêm nội dung vào Story
                Bible hoặc viết thêm vài câu vào chương rồi thử lại.
              </p>
            ) : (
              <ul className="space-y-3">
                {suggestResult.suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
                  >
                    <p className="font-semibold">{s.title}</p>
                    <p className="mt-1 text-sm">{s.summary}</p>
                    {s.continuesThread && (
                      <p className="mt-1 text-sm">
                        <span className="font-medium">Tiếp nối: </span>
                        {s.continuesThread}
                      </p>
                    )}
                    <p className="mt-1 text-sm">
                      <span className="font-medium">Vì sao hợp: </span>
                      {s.whyItFits}
                    </p>
                    {s.risk && (
                      <p className="mt-1 text-sm text-stone-600">
                        <span className="font-medium">Cần tránh: </span>
                        {s.risk}
                      </p>
                    )}
                    <button
                      onClick={() => applySuggestion(s)}
                      className="mt-2 rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      Dùng hướng này để viết tiếp ↓
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">✍️ Viết bằng AI</h2>
            <p className="text-sm text-stone-500">
              Chưa viết gì cũng được: chỉ cần nhập hướng viết (hoặc chọn
              gợi ý bên trên), AI sẽ viết đoạn mở đầu chương. Đã có nội
              dung thì AI viết tiếp ngay sau đoạn đó, giữ đúng giọng văn,
              nhân vật và luật trong Bible. Đoạn viết ra chỉ là bản nháp —
              chỉ chèn vào chương khi bạn bấm nút chèn.
            </p>
          </div>
          <button
            onClick={onContinue}
            disabled={continuing || (!content.trim() && !direction.trim())}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {continuing
              ? "Đang viết..."
              : content.trim()
                ? "Viết tiếp"
                : "Viết chương"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <input
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            placeholder="Hướng viết: VD: Đường Tam phát hiện ra manh mối mới... — bắt buộc nếu chương chưa có nội dung; hoặc bấm 'Dùng hướng này' ở gợi ý bên trên"
            className={`${inputCls} flex-1`}
          />
          <select
            value={targetWords}
            onChange={(e) => setTargetWords(Number(e.target.value))}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
            aria-label="Độ dài đoạn viết tiếp"
          >
            <option value={400}>~400 từ</option>
            <option value={600}>~600 từ</option>
            <option value={1000}>~1000 từ</option>
            <option value={1500}>~1500 từ</option>
            <option value={2000}>~2000 từ</option>
          </select>
        </div>

        {continueError && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {continueError}
          </p>
        )}

        {continueResult && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-stone-500">
              Viết tiếp bằng {continueResult.model}
              {continueResult.retrieval
                ? `, đối chiếu với ${continueResult.retrieval.count} đoạn liên quan nhất.`
                : "."}
            </p>
            <p className="whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 font-serif text-sm leading-relaxed">
              {continueResult.continuation}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={insertContinuation}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Chèn vào chương
              </button>
              <button
                onClick={() => setContinueResult(null)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-semibold hover:border-amber-400"
              >
                Bỏ đoạn này
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChapterEditorPage() {
  return (
    <Suspense fallback={<p className="text-sm text-stone-500">Đang tải...</p>}>
      <ChapterEditorPageContent />
    </Suspense>
  );
}
