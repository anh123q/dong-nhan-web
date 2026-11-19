-- ============================================================
-- Đồng Nhân — Schema Supabase
-- Chạy toàn bộ file này trong Supabase Dashboard > SQL Editor
-- (dán vào và bấm Run). Chạy lại nhiều lần vẫn an toàn.
-- ============================================================

-- pgvector: bắt buộc cho bảng embeddings (RAG ở Day 3-4).
-- Nếu câu lệnh dưới báo lỗi quyền, hãy bật bằng tay:
-- Dashboard > Database > Extensions > tìm "vector" > Enable,
-- rồi chạy lại phần còn lại của file (bỏ qua dòng create extension).
create extension if not exists vector;
create extension if not exists "pgcrypto";

-- ---------- Bảng truyện ----------
create table if not exists stories (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  original_work text not null default '',
  description text not null default '',
  cover_url text,
  tags text[] not null default '{}',
  status text not null default 'dang-viet'
    check (status in ('dang-viet', 'tam-dung', 'hoan-thanh')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Bảng chương ----------
create table if not exists chapters (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories (id) on delete cascade,
  number int not null,
  title text not null,
  content text not null default '',
  status text not null default 'nhap'
    check (status in ('nhap', 'xuat-ban')),
  summary text,
  word_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, number)
);
create index if not exists chapters_story_id_idx on chapters (story_id);

-- ---------- Nguồn canon (truyện gốc đã nhập) ----------
create table if not exists canon_sources (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories (id) on delete cascade,
  title text not null,
  source_type text not null default 'paste'
    check (source_type in ('paste', 'file', 'url')),
  source_url text,
  content text not null default '',
  char_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists canon_sources_story_id_idx on canon_sources (story_id);

-- ---------- Story Bible ----------
create table if not exists bible_entries (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories (id) on delete cascade,
  type text not null
    check (type in ('nhan-vat', 'quy-tac', 'timeline', 'plot-thread')),
  title text not null,
  content text not null default '',
  related_characters text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists bible_entries_story_id_idx on bible_entries (story_id);

-- ---------- Tóm tắt chương ----------
create table if not exists chapter_summaries (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters (id) on delete cascade,
  story_id uuid not null references stories (id) on delete cascade,
  summary text not null default '',
  created_at timestamptz not null default now(),
  unique (chapter_id)
);
create index if not exists chapter_summaries_story_id_idx on chapter_summaries (story_id);

-- ---------- Tóm tắt arc tổng thể (1 dòng cho mỗi truyện) ----------
-- Do AI duy trì: mỗi lần xuất bản 1 chương, tóm tắt arc được cập nhật
-- tăng dần (gộp arc cũ + tóm tắt chương mới) để AI luôn nắm mạch truyện
-- dài mà không cần đọc lại toàn bộ chương.
create table if not exists story_summaries (
  story_id uuid primary key references stories (id) on delete cascade,
  summary text not null default '',
  updated_at timestamptz not null default now()
);

-- ---------- Embeddings cho RAG (Day 3-4) ----------
-- vector(768): model gemini-embedding-001 mặc định trả 3072 chiều, code
-- web luôn đặt outputDimensionality=768 khi gọi API nên khớp cột này.
-- ĐỪNG đổi số chiều ở đây nếu chưa đổi EMBED_DIMENSIONS trong code.
-- Nếu chưa bật được extension vector, hãy comment toàn bộ khối này
-- (từ create table embeddings tới create index) — các bảng trên vẫn
-- chạy bình thường, RAG sẽ thêm sau khi bật extension.
create table if not exists embeddings (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references stories (id) on delete cascade,
  source_type text not null
    check (source_type in ('canon', 'chapter', 'summary', 'bible')),
  source_id uuid,
  chunk_index int not null default 0,
  content text not null default '',
  embedding vector(768),
  created_at timestamptz not null default now()
);
create index if not exists embeddings_story_id_idx on embeddings (story_id);
-- Index HNSW để tìm đoạn liên quan nhanh (chỉ tạo được khi đã có extension vector).
create index if not exists embeddings_vector_idx
  on embeddings using hnsw (embedding vector_cosine_ops);

-- ---------- Hàm tìm đoạn liên quan (RAG) ----------
-- match_embeddings: nhận 1 vector truy vấn, trả về top chunk giống nhất
-- trong cùng truyện (độ tương tự cosine), trừ nguồn đang kiểm tra.
-- Web gọi qua supabase.rpc("match_embeddings", {...}).
create or replace function match_embeddings(
  query_embedding vector(768),
  p_story_id uuid,
  match_count int default 10,
  p_exclude_source_id uuid default null
)
returns table (
  id uuid,
  source_type text,
  source_id uuid,
  chunk_index int,
  content text,
  similarity float
)
language sql stable
as $$
  select
    e.id,
    e.source_type,
    e.source_id,
    e.chunk_index,
    e.content,
    1 - (e.embedding <=> query_embedding) as similarity
  from embeddings e
  where e.story_id = p_story_id
    and e.embedding is not null
    and (p_exclude_source_id is null or e.source_id is distinct from p_exclude_source_id)
  order by e.embedding <=> query_embedding
  limit match_count;
$$;

-- ---------- Tự cập nhật updated_at ----------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists stories_set_updated_at on stories;
create trigger stories_set_updated_at
  before update on stories
  for each row execute function set_updated_at();

drop trigger if exists chapters_set_updated_at on chapters;
create trigger chapters_set_updated_at
  before update on chapters
  for each row execute function set_updated_at();

drop trigger if exists bible_entries_set_updated_at on bible_entries;
create trigger bible_entries_set_updated_at
  before update on bible_entries
  for each row execute function set_updated_at();

-- ---------- Row Level Security ----------
-- MVP dùng cá nhân, chưa có đăng nhập: cho phép anon key đọc/ghi.
-- KHI MỞ PUBLIC HOẶC THÊM AUTH: thay các policy dưới đây bằng policy
-- giới hạn theo user_id, nếu không ai có anon key cũng đọc/ghi được.
alter table stories enable row level security;
alter table chapters enable row level security;
alter table canon_sources enable row level security;
alter table bible_entries enable row level security;
alter table chapter_summaries enable row level security;
alter table story_summaries enable row level security;
alter table embeddings enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'stories', 'chapters', 'canon_sources',
    'bible_entries', 'chapter_summaries', 'story_summaries', 'embeddings'
  ] loop
    execute format(
      'drop policy if exists "mvp_cho_phep_tat_ca" on %I', t
    );
    execute format(
      'create policy "mvp_cho_phep_tat_ca" on %I ' ||
      'for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- ---------- Quyền truy cập bảng cho anon/authenticated ----------
-- RLS policy thôi CHƯA ĐỦ: role anon/authenticated còn cần quyền
-- SELECT/INSERT/UPDATE/DELETE ở cấp bảng thì PostgREST mới cho qua.
-- Bảng tạo qua Management API không tự có các quyền này (lỗi thực tế
-- gặp ngày 19/11/2026: "permission denied for table embeddings", web
-- lặng lẽ fallback về localStorage trong khi banner vẫn báo đã nối cloud).
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges in schema public grant usage, select on sequences to anon, authenticated;
grant execute on function public.match_embeddings(vector, uuid, integer, uuid) to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
