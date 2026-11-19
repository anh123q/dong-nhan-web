// Lưu trữ cục bộ (localStorage) — dùng khi chưa cấu hình Supabase.
// Toàn bộ hàm ở đây chỉ chạy phía trình duyệt.

import type {
  BibleEntry,
  CanonSource,
  Chapter,
  ChapterSummary,
  Story,
} from "./types";

const STORAGE_KEY = "dongnhan-db-v1";

export interface LocalDb {
  stories: Story[];
  chapters: Chapter[];
  canonSources: CanonSource[];
  bibleEntries: BibleEntry[];
  summaries: ChapterSummary[];
}

const emptyDb: LocalDb = {
  stories: [],
  chapters: [],
  canonSources: [],
  bibleEntries: [],
  summaries: [],
};

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

/**
 * Truyện demo duy nhất để user xem thử giao diện.
 * Nội dung demo do web tự viết, KHÔNG phải trích nguyên tác thật.
 */
function seedDemoDb(): LocalDb {
  const storyId = newId();
  const ch1Id = newId();
  const ch2Id = newId();
  const t = nowIso();
  return {
    stories: [
      {
        id: storyId,
        title: "Đấu La: Con Đường Khác (Demo)",
        originalWork: "Đấu La Đại Lục",
        description:
          "Truyện demo để trải nghiệm thử các tính năng đọc, viết, nhập truyện gốc và Story Bible. Bạn có thể sửa hoặc xóa truyện này bất cứ lúc nào.",
        coverUrl: undefined,
        tags: ["demo", "đồng nhân", "huyền huyễn"],
        status: "dang-viet",
        createdAt: t,
        updatedAt: t,
      },
    ],
    chapters: [
      {
        id: ch1Id,
        storyId,
        number: 1,
        title: "Khởi đầu mới",
        content: `Lâm Phong mở mắt, trước mặt là một khu rừng lạ lẫm.

Cậu nhớ rõ mình vừa đọc xong chương cuối của bộ truyện yêu thích, vậy mà giờ đây, trong tay cậu lại nắm chặt một thanh đoản kiếm chưa từng thấy bao giờ.

"Đây là... Đấu La Đại Lục sao?" Lâm Phong lẩm bẩm. Cậu cúi xuống nhìn bàn tay mình, nơi một luồng hồn lực yếu ớt đang lặng lẽ lưu chuyển.

Cậu không phải Đường Tam. Cậu cũng không có song sinh võ hồn. Thứ cậu có chỉ là trí nhớ về toàn bộ cốt truyện — và một quyết định: lần này, cậu sẽ không đứng ngoài cuộc nữa.`,
        status: "xuat-ban",
        summary:
          "Lâm Phong xuyên vào thế giới Đấu La Đại Lục, tỉnh lại trong rừng với một thanh đoản kiếm và hồn lực yếu. Cậu quyết định can thiệp vào cốt truyện thay vì đứng ngoài.",
        wordCount: 120,
        createdAt: t,
        updatedAt: t,
      },
      {
        id: ch2Id,
        storyId,
        number: 2,
        title: "Lựa chọn",
        content: `Đi được nửa ngày, Lâm Phong gặp một ngôi làng nhỏ nằm nép mình bên bìa rừng.

Trưởng làng là một lão nhân tóc bạc, ánh mắt hiền từ nhưng sắc bén. Ông nhìn thanh đoản kiếm trong tay Lâm Phong rồi khẽ gật đầu: "Võ hồn khí, hiếm thấy ở vùng này."

Lâm Phong do dự. Cậu biết rõ những gì sắp xảy ra với ngôi làng này trong nguyên tác — một biến cố mà cậu có thể ngăn lại, nếu cậu chịu ra tay.

"Ông ơi," cậu hít sâu một hơi, "tối nay, xin đừng để ai ra khỏi làng."

Lão nhân nhíu mày. Lâm Phong biết mình vừa bước qua một ranh giới: từ người biết chuyện, cậu đã trở thành người thay đổi chuyện.`,
        status: "xuat-ban",
        summary:
          "Lâm Phong tới một ngôi làng nhỏ, được trưởng làng nhận ra võ hồn khí. Cậu cảnh báo dân làng đừng ra ngoài vào tối nay, chính thức can thiệp vào cốt truyện gốc.",
        wordCount: 130,
        createdAt: t,
        updatedAt: t,
      },
    ],
    canonSources: [
      {
        id: newId(),
        storyId,
        title: "Tóm tắt bối cảnh demo (do web tự viết)",
        sourceType: "paste",
        content:
          "Bối cảnh demo: thế giới Đấu La Đại Lục, nơi con người thức tỉnh võ hồn và tu luyện hồn lực. Hồn sư săn hồn thú để lấy hồn hoàn, mỗi 10 cấp cần một hồn hoàn mới. Đây là nội dung demo do web tự viết để minh họa tính năng nhập truyện gốc, không phải văn bản nguyên tác thật.",
        charCount: 240,
        createdAt: t,
      },
    ],
    bibleEntries: [
      {
        id: newId(),
        storyId,
        type: "nhan-vat",
        title: "Lâm Phong (nhân vật chính - OC)",
        content:
          "Tuổi 17, xuyên không từ hiện đại. Tính cách: cẩn thận, trọng tình nghĩa, ghét đứng ngoài cuộc. Võ hồn: đoản kiếm (khí võ hồn). Hồn lực khởi đầu yếu, cấp 11. Biết trước cốt truyện gốc nhưng quyết tâm thay đổi một số biến cố.",
        relatedCharacters: "Trưởng làng (lão nhân tóc bạc)",
        createdAt: t,
        updatedAt: t,
      },
      {
        id: newId(),
        storyId,
        type: "quy-tac",
        title: "Quy tắc hồn hoàn",
        content:
          "Hồn sư mỗi 10 cấp cần hấp thu một hồn hoàn từ hồn thú. Hồn hoàn đầu tiên tối đa 423 năm. Vượt quá giới hạn sẽ nổ thể mà chết. Đây là luật cứng của thế giới, không được phá vỡ.",
        createdAt: t,
        updatedAt: t,
      },
      {
        id: newId(),
        storyId,
        type: "plot-thread",
        title: "Biến cố của ngôi làng",
        content:
          "Lâm Phong đã cảnh báo dân làng ở chương 2. Biến cố gốc có bị ngăn lại hoàn toàn không, hay chỉ bị hoãn lại? Cần giải quyết trước chương 5.",
        createdAt: t,
        updatedAt: t,
      },
    ],
    summaries: [
      {
        id: newId(),
        chapterId: ch1Id,
        storyId,
        summary:
          "Lâm Phong xuyên vào thế giới Đấu La Đại Lục, tỉnh lại trong rừng với một thanh đoản kiếm và hồn lực yếu. Cậu quyết định can thiệp vào cốt truyện thay vì đứng ngoài.",
        createdAt: t,
      },
      {
        id: newId(),
        chapterId: ch2Id,
        storyId,
        summary:
          "Lâm Phong tới một ngôi làng nhỏ, được trưởng làng nhận ra võ hồn khí. Cậu cảnh báo dân làng đừng ra ngoài vào tối nay, chính thức can thiệp vào cốt truyện gốc.",
        createdAt: t,
      },
    ],
  };
}

export function loadDb(): LocalDb {
  if (typeof window === "undefined") return structuredClone(emptyDb);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = seedDemoDb();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw) as LocalDb;
    return { ...emptyDb, ...parsed };
  } catch {
    return structuredClone(emptyDb);
  }
}

export function saveDb(db: LocalDb): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

/** Xóa toàn bộ dữ liệu local (kể cả truyện demo) và seed lại từ đầu. */
export function resetDb(): LocalDb {
  const seeded = seedDemoDb();
  saveDb(seeded);
  return seeded;
}

/**
 * Tóm tắt arc tổng thể của mỗi truyện (1 đoạn ngắn do AI duy trì).
 * Lưu ở key riêng, không nằm trong db chính để không phình blob
 * localStorage chính. Mỗi truyện chỉ có đúng 1 tóm tắt arc.
 */
const ARC_KEY = "dongnhan-arc-v1";

export function loadArcSummary(storyId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(window.localStorage.getItem(ARC_KEY) || "{}") as Record<
      string,
      string
    >;
    return all[storyId] ?? null;
  } catch {
    return null;
  }
}

export function saveArcSummaryLocal(storyId: string, summary: string): void {
  if (typeof window === "undefined") return;
  try {
    const all = JSON.parse(window.localStorage.getItem(ARC_KEY) || "{}") as Record<
      string,
      string
    >;
    all[storyId] = summary;
    window.localStorage.setItem(ARC_KEY, JSON.stringify(all));
  } catch {
    // localStorage đầy — tóm tắt arc không quan trọng bằng dữ liệu
    // chính nên bỏ qua lỗi, lần sau tạo lại được.
  }
}

/** Vị trí đang đọc, lưu theo từng truyện. */
const PROGRESS_KEY = "dongnhan-progress-v1";

export interface ReadingProgress {
  storyId: string;
  chapterId: string;
  scrollY: number;
  updatedAt: string;
}

export function loadProgress(): Record<string, ReadingProgress> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || "{}") as Record<
      string,
      ReadingProgress
    >;
  } catch {
    return {};
  }
}

export function saveProgress(p: ReadingProgress): void {
  if (typeof window === "undefined") return;
  const all = loadProgress();
  all[p.storyId] = p;
  window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));
}
