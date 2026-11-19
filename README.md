# Đồng Nhân — Website viết truyện đồng nhân cá nhân

Website viết truyện đồng nhân (fanfiction) dùng cá nhân: đọc, viết, nhập
truyện gốc (canon) và kiểm tra mâu thuẫn bằng AI. Chưa có đăng nhập — dùng
cho 1 người trước.

> Bản hiện tại đã xong Day 3–6 của kế hoạch 7 ngày (hạn xong 25/11/2026):
> RAG thật (vector pgvector + fallback từ khóa), tóm tắt chương tự động,
> tóm tắt arc, gợi ý cốt truyện và viết tiếp chương bằng AI. Còn lại:
> Supabase Storage cho ảnh bìa, PDF/EPUB/DOCX, nút lập chỉ mục lại, hoàn
> thiện mobile, test với truyện thật và deploy.

## Tính năng đã có

- **Trang chủ**: danh sách truyện (bìa, tên, nguyên tác, trạng thái, chương
  mới nhất), tìm kiếm + lọc theo nguyên tác / tag.
- **Trang chi tiết truyện**: bìa, giới thiệu, tag, trạng thái, danh sách
  chương (đã xuất bản + nháp), nút đọc tiếp chương đang dở.
- **Trang đọc chương**: chương trước/sau, chỉnh cỡ chữ, font serif/sans,
  nền sáng/tối/nâu, tự động lưu vị trí đang đọc.
- **Viết truyện**: tạo/sửa truyện, upload bìa (tạm lưu trên trình duyệt),
  trình soạn thảo chương tự lưu nháp sau 1 giây ngừng gõ, xuất bản / gỡ
  xuống nháp, tóm tắt chương.
- **Nhập truyện gốc**: paste text, upload file .txt, hoặc nhập từ URL
  (fetch phía server, trích text chính). Nguồn canon gắn với từng truyện.
- **Story Bible**: quản lý nhân vật, quy tắc thế giới, timeline, plot
  thread đang mở — “luật” để AI kiểm tra mâu thuẫn.
- **Kiểm tra mâu thuẫn bằng AI** (trong trình soạn thảo): AI đối chiếu
  chương với Story Bible + tóm tắt arc + tóm tắt chương trước + các đoạn
  canon/chương liên quan nhất tìm bằng RAG, trả về danh sách mâu thuẫn
  kèm mức độ (nghiêm trọng / trung bình / nhẹ), bằng chứng ghi rõ nguồn
  đối chiếu (chương/canon/Bible nào) và gợi ý sửa.
- **RAG thật**: chương xuất bản, nguồn canon và mục Bible được cắt chunk
  (~800 token, overlap), tạo embedding bằng Gemini và lưu vào bảng
  `embeddings` (pgvector). Khi kiểm tra, AI chỉ đọc top đoạn liên quan
  nhất thay vì toàn bộ truyện. Chưa nối Supabase thì tự dùng tìm kiếm từ
  khóa trên trình duyệt, không crash.
- **Tóm tắt tự động**: mỗi lần xuất bản 1 chương, AI tự tạo tóm tắt có
  cấu trúc (sự kiện chính, thay đổi nhân vật, sự thật mới, plot thread
  còn mở) và cập nhật tóm tắt arc tổng thể của truyện.

## Chạy local

Yêu cầu: Node.js 18 trở lên, npm.

```bash
npm install
cp .env.example .env.local   # chưa có key vẫn chạy được (xem dưới)
npm run dev
```

Mở http://localhost:3000.

**Chưa có key vẫn dùng được:** nếu chưa điền Supabase và Gemini key, web
tự lưu dữ liệu vào localStorage của trình duyệt, chỉ tính năng kiểm tra
mâu thuẫn bằng AI là báo “chưa cấu hình key”. Có sẵn 1 truyện demo để xem
thử giao diện (xóa được).

## Nối Supabase (lưu dữ liệu lên cloud)

1. Tạo tài khoản và project mới tại https://supabase.com/dashboard
   (gói Free là đủ).
2. Mở **SQL Editor** trong Dashboard, dán toàn bộ file
   `supabase/schema.sql` vào và bấm **Run**. File này tạo các bảng:
   `stories`, `chapters`, `canon_sources`, `bible_entries`,
   `chapter_summaries`, `story_summaries`, `embeddings` và hàm
   `match_embeddings` (tìm đoạn liên quan cho RAG). Nếu đã chạy file này
   ở bản trước, chạy lại để thêm bảng `story_summaries` và hàm mới.
3. Bật extension **vector** (pgvector) cho bảng `embeddings`:
   **Database → Extensions → tìm “vector” → Enable**. Nếu bước Run ở trên
   đã bật được extension thì không cần làm thêm.
4. Lấy key ở **Project Settings → API**: `Project URL` và `anon public`
   key, điền vào `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   ```
5. Khởi động lại `npm run dev`. Banner trên trang chủ sẽ báo “Đã nối
   Supabase”.

Lưu ý:

- Project Supabase Free bị tạm dừng sau 1 tuần không hoạt động — mở web
  hoặc Dashboard 1 lần/tuần là được.
- Schema hiện cho phép anon key đọc/ghi (phù hợp dùng cá nhân, chưa có
  đăng nhập). Khi mở public hoặc thêm đăng nhập, phải siết lại Row Level
  Security — xem ghi chú trong `supabase/schema.sql`.
- Dữ liệu localStorage cũ không tự chuyển sang Supabase. Nếu đã viết
  truyện trước khi nối cloud, hãy copy nội dung sang sau khi nối.

## Lấy Gemini API key (để AI kiểm tra mâu thuẫn)

1. Mở https://aistudio.google.com/apikey (đăng nhập bằng tài khoản Google).
2. Bấm **Create API key** (miễn phí, có hạn mức dùng thử).
3. Thêm vào `.env.local`:
   ```env
   GEMINI_API_KEY=<key>
   GEMINI_MODEL=gemini-3.8-flash
   GEMINI_BULK_MODEL=gemini-3.5-flash-lite
   GEMINI_EMBED_MODEL=gemini-embedding-001
   ```
4. Khởi động lại `npm run dev`.

Key chỉ dùng phía server (các API route `/api/ai/*`), không lộ ra trình
duyệt. Nếu chưa có key, các tính năng AI báo lỗi rõ ràng (503) thay vì
crash.

### Model đang dùng (đã kiểm chứng bằng key thật, tháng 11/2026)

| Việc | Model mặc định | Ghi chú |
| --- | --- | --- |
| Kiểm tra mâu thuẫn | `gemini-3.8-flash` | Đổi qua `GEMINI_MODEL` |
| Tóm tắt / việc hàng loạt | `gemini-3.5-flash-lite` | Đổi qua `GEMINI_BULK_MODEL`, free tier 500 request/ngày |
| Embedding (RAG) | `gemini-embedding-001` | Đổi qua `GEMINI_EMBED_MODEL`, luôn ép 768 chiều |

- `gemini-2.5-flash` đã ngừng phục vụ user mới (API trả 404) — đừng
  dùng, kể cả khi thấy nó trong tài liệu cũ.
- `gemini-3.8-flash` đôi khi 503 quá tải: web tự fallback sang
  `gemini-3.5-flash-lite` khi gặp 503/429, kết quả kiểm tra vẫn ghi rõ
  model thực sự đã trả lời.
- `text-embedding-004` không còn tồn tại. `gemini-embedding-001` mặc
  định trả 3072 chiều, code luôn đặt `outputDimensionality=768` để khớp
  cột `vector(768)` trong schema.

## Cách RAG hoạt động (tóm tắt)

1. **Lập chỉ mục** (`POST /api/ai/index`): khi xuất bản chương, lưu nguồn
   canon hoặc lưu mục Bible, nội dung được cắt thành chunk ~800 token
   (overlap ~200 token), tạo embedding rồi lưu vào bảng `embeddings`.
   Nguồn quá dài chỉ lập chỉ mục 120 chunk đầu và báo rõ là đã cắt ngắn.
2. **Truy xuất**: khi kiểm tra 1 chương, server embed chương đó rồi gọi
   hàm `match_embeddings` (SQL trong `schema.sql`) để lấy top 10 chunk
   giống nhất trong cùng truyện (canon + chương trước + Bible), loại
   chunk của chính chương đang kiểm tra.
3. **Kiểm tra**: prompt gồm Bible + tóm tắt arc + tóm tắt chương trước +
   các chunk liên quan (có nhãn nguồn). Mỗi mâu thuẫn bắt buộc ghi bằng
   chứng kèm nhãn nguồn đối chiếu.
4. **Chế độ local** (chưa nối Supabase): không có vector, trình duyệt tự
   tìm top 8 chunk theo từ khóa rồi gửi kèm cho API kiểm tra. Kết quả
   ghi rõ chế độ nào đã dùng (`vector` / `keyword` / `none`).

## Thử RAG khi đã có key

1. Điền đủ `.env.local` (Supabase URL + anon key, `GEMINI_API_KEY`) rồi
   chạy `npm run dev`.
2. Chạy lại file `supabase/schema.sql` trong SQL Editor (đã có thêm bảng
   `story_summaries` và hàm `match_embeddings`; chạy lại nhiều lần vẫn
   an toàn).
3. Mở truyện demo, vào trang **Nhập truyện gốc**, lưu 1 nguồn canon —
   thông báo sẽ ghi "Đã lập chỉ mục AI (N đoạn)".
4. Vào trình soạn thảo chương 2, bấm **Xuất bản chương** — tóm tắt AI tự
   tạo sẽ hiện ở ô tóm tắt.
5. Bấm **Kiểm tra ngay** — kết quả ghi "Đã đối chiếu với N đoạn liên quan
   nhất (tìm bằng vector...)".
6. Thử ở chế độ local: xóa 2 biến Supabase khỏi `.env.local`, khởi động
   lại — kiểm tra vẫn chạy, kết quả ghi "(tìm bằng từ khóa...)".
7. Thử chưa có key: xóa `GEMINI_API_KEY`, khởi động lại — nút kiểm tra
   báo lỗi 503 rõ ràng bằng tiếng Việt, web không crash.

Giới hạn hiện tại: lập chỉ mục tối đa 120 chunk/nguồn (~300.000 ký tự);
nguồn canon dài hơn chỉ lập chỉ mục phần đầu. Chưa có nút "lập chỉ mục
lại toàn bộ truyện" — nguồn cũ nhập trước khi có RAG cần lưu lại 1 lần
để được lập chỉ mục. Chưa hỗ trợ file PDF/EPUB/DOCX (dự kiến Day 6–7).

## Deploy lên Vercel

1. Push code lên GitHub (repo riêng).
2. Vào https://vercel.com → **Add New → Project** → chọn repo → **Deploy**
   (Vercel tự nhận Next.js, không cần chỉnh gì).
3. Vào **Project → Settings → Environment Variables**, thêm 3 biến như
   trong `.env.example` (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`), rồi **Redeploy**.
4. Gói Vercel Hobby (miễn phí) chỉ dùng cho dự án cá nhân, phi thương
   mại — vừa đúng nhu cầu hiện tại.

## Cấu trúc thư mục

```
src/
  app/
    page.tsx                    Trang chủ (danh sách + tìm kiếm/lọc)
    truyen/[id]/page.tsx        Chi tiết truyện + danh sách chương
    doc/[storyId]/[chapterId]/  Trang đọc chương
    viet/                       Viết truyện (dashboard, sửa truyện, soạn chương)
    nhap/page.tsx               Nhập truyện gốc (paste/file/URL)
    bible/[storyId]/page.tsx    Story Bible
    api/
      ai/check/route.ts         API kiểm tra mâu thuẫn (Gemini + RAG)
      ai/summarize/route.ts     API tóm tắt chương + cập nhật tóm tắt arc
      ai/index/route.ts         API lập chỉ mục / xóa vector RAG
      import-url/route.ts       API fetch + trích text từ URL
  components/                   StoryCard, StatusBadge, StorageBanner
  lib/
    types.ts                    Kiểu dữ liệu dùng chung
    supabase.ts                 Supabase client (null khi chưa có key)
    store.ts                    localStorage + truyện demo
    data.ts                     Lớp dữ liệu: Supabase khi có key, fallback local
    gemini.ts                   Gọi Gemini API phía server (có fallback model)
    embeddings.ts               Gọi Gemini Embedding API (batch, 768 chiều)
    chunks.ts                   Cắt chunk + tìm kiếm từ khóa (dùng chung)
    rag.ts                      Lập chỉ mục + truy xuất vector (server)
    summarize.ts                Tóm tắt chương có cấu trúc + tóm tắt arc
    image.ts                    Thu nhỏ ảnh bìa trước khi lưu local
supabase/
  schema.sql                    Schema Supabase (chạy trong SQL Editor)
```

- **Gợi ý cốt truyện bằng AI** (trong trình soạn thảo): 3 hướng phát triển
  khác nhau cho chương tiếp theo, mỗi hướng nêu rõ tiếp nối plot thread
  nào, vì sao hợp với Bible/canon và rủi ro mâu thuẫn cần tránh. Bấm
  "Dùng hướng này" để đưa hướng đó vào ô hướng viết tiếp.
- **Viết tiếp chương bằng AI** (trong trình soạn thảo): AI viết tiếp ngay
  sau đoạn đã viết (~400/600/1000 từ, theo hướng user chọn nếu có), giữ
  đúng giọng văn, nhân vật và luật trong Bible. Đoạn viết ra chỉ là bản
  nháp — chỉ chèn vào cuối chương khi user bấm "Chèn vào cuối chương".
  Cả 2 tính năng dùng chung RAG 3 tầng (vector → từ khóa → Bible +
  tóm tắt) như kiểm tra mâu thuẫn; chưa có key thì báo 503 rõ ràng.

## Lộ trình tiếp theo (Day 6–7)

- **Day 6**: Supabase Storage cho ảnh bìa, đồng bộ tiến độ đọc lên cloud.
- **Day 7**: hỗ trợ file PDF/EPUB/DOCX khi nhập truyện gốc, nút lập chỉ
  mục lại toàn bộ truyện, hoàn thiện giao diện mobile, test với truyện
  thật và deploy bản chính.
