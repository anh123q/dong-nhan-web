import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client (phía trình duyệt, dùng anon key).
 *
 * Chưa có key thật thì client = null và toàn bộ dữ liệu chạy bằng
 * localStorage (xem lib/store.ts). Khi user tạo project Supabase và điền
 * 2 biến dưới đây vào .env.local thì dữ liệu tự chuyển sang Supabase.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.includes("placeholder") || value.trim() === "";
}

export const isSupabaseConfigured =
  !isPlaceholder(url) && !isPlaceholder(anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string)
  : null;
