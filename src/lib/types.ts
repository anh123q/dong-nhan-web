// Kiểu dữ liệu dùng chung cho toàn bộ website viết truyện đồng nhân.

export type StoryStatus = "dang-viet" | "tam-dung" | "hoan-thanh";

export const STORY_STATUS_LABEL: Record<StoryStatus, string> = {
  "dang-viet": "Đang viết",
  "tam-dung": "Tạm dừng",
  "hoan-thanh": "Hoàn thành",
};

export interface Story {
  id: string;
  title: string;
  /** Tên nguyên tác, vd: "Đấu La Đại Lục", "Naruto", "Quỷ Bí Chi Chủ" */
  originalWork: string;
  description: string;
  /** data URL (lưu local) hoặc URL Supabase Storage (khi đã nối cloud) */
  coverUrl?: string;
  tags: string[];
  status: StoryStatus;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export type ChapterStatus = "nhap" | "xuat-ban";

export interface Chapter {
  id: string;
  storyId: string;
  number: number;
  title: string;
  content: string;
  status: ChapterStatus;
  /** Tóm tắt ngắn của chương, dùng cho AI kiểm tra mâu thuẫn */
  summary?: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export type CanonSourceType = "paste" | "file" | "url";

export interface CanonSource {
  id: string;
  storyId: string;
  title: string;
  sourceType: CanonSourceType;
  sourceUrl?: string;
  content: string;
  charCount: number;
  createdAt: string;
}

export type BibleEntryType = "nhan-vat" | "quy-tac" | "timeline" | "plot-thread";

export const BIBLE_TYPE_LABEL: Record<BibleEntryType, string> = {
  "nhan-vat": "Nhân vật",
  "quy-tac": "Quy tắc thế giới",
  timeline: "Timeline",
  "plot-thread": "Plot thread đang mở",
};

/**
 * 1 mục trong Story Bible — "luật" để AI kiểm tra mâu thuẫn.
 * Nhân vật: ghi tên, tính cách, ngoại hình, quan hệ.
 * Quy tắc: ghi luật của thế giới (sức mạnh, cấp bậc, địa lý...).
 * Timeline: ghi mốc thời gian quan trọng.
 * Plot thread: ghi các tuyến truyện đang mở / chưa giải quyết.
 */
export interface BibleEntry {
  id: string;
  storyId: string;
  type: BibleEntryType;
  title: string;
  content: string;
  /** Chỉ dùng cho nhân vật: tên các nhân vật liên quan */
  relatedCharacters?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterSummary {
  id: string;
  chapterId: string;
  storyId: string;
  summary: string;
  createdAt: string;
}

/**
 * Tóm tắt chương có cấu trúc do AI tạo (lưu dạng JSON trong bảng
 * chapter_summaries). Chương nào cũng có 5 phần này để AI kiểm tra
 * chương sau đối chiếu được chính xác.
 */
export interface StructuredSummary {
  /** Tóm tắt 1-2 câu — cũng lưu vào Chapter.summary để hiển thị. */
  oneLine: string;
  /** Sự kiện chính xảy ra trong chương, mỗi mục 1 dòng. */
  events: string[];
  /** Nhân vật thay đổi gì: tính cách, khả năng, quan hệ, trạng thái. */
  characterChanges: string[];
  /** Sự thật mới được tiết lộ (bí mật, quy tắc, thân phận...). */
  newFacts: string[];
  /** Plot thread còn mở sau chương này. */
  openThreads: string[];
}

/** 1 đoạn văn bản liên quan nhất mà RAG tìm được để đưa vào prompt. */
export interface RetrievedChunk {
  /** Nhãn hiển thị nguồn, vd: "Chương 3 — Lựa chọn" hay "Canon: Quyển 1". */
  label: string;
  sourceType: "chapter" | "canon" | "bible" | "summary";
  text: string;
  /** Độ tương tự 0-1 (chỉ có ở chế độ vector). */
  score?: number;
}

/** Cách AI lấy được ngữ cảnh cho lần kiểm tra này. */
export type RetrievalMode = "vector" | "keyword" | "none";

export type ContradictionSeverity = "cao" | "trung-binh" | "thap";

export interface Contradiction {
  severity: ContradictionSeverity;
  category: string;
  description: string;
  /** Bằng chứng: trích đoạn hoặc tham chiếu tới chương / mục Bible */
  evidence: string;
  suggestion: string;
}

export interface AiCheckResult {
  contradictions: Contradiction[];
  model: string;
  checkedAt: string;
  /** AI đã đối chiếu với bao nhiêu đoạn liên quan, bằng cách nào. */
  retrieval?: {
    mode: RetrievalMode;
    count: number;
  };
}

/** 1 hướng phát triển cốt truyện do AI gợi ý. */
export interface PlotSuggestion {
  title: string;
  /** Diễn biến gợi ý trong 3-5 câu. */
  summary: string;
  /** Plot thread đang mở nào được tiếp nối (hoặc "Mở thread mới: ..."). */
  continuesThread?: string;
  /** Vì sao hướng này hợp với Bible/canon/chương trước. */
  whyItFits: string;
  /** Rủi ro mâu thuẫn cần tránh khi viết theo hướng này. */
  risk?: string;
}

export interface AiSuggestResult {
  suggestions: PlotSuggestion[];
  model: string;
  generatedAt: string;
  retrieval?: {
    mode: RetrievalMode;
    count: number;
  };
}

/** Đoạn viết tiếp do AI tạo — bản nháp, chỉ chèn khi user đồng ý. */
export interface AiContinueResult {
  continuation: string;
  model: string;
  generatedAt: string;
  retrieval?: {
    mode: RetrievalMode;
    count: number;
  };
}
