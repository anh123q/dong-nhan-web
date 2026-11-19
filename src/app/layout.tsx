import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Đồng Nhân — Viết truyện cá nhân",
  description:
    "Website viết truyện đồng nhân cá nhân: đọc, viết, nhập truyện gốc và kiểm tra mâu thuẫn bằng AI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-stone-50 text-stone-900 antialiased">
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-xl font-bold text-amber-700">
              📖 Đồng Nhân
            </Link>
            <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-medium">
              <Link href="/" className="text-stone-700 hover:text-amber-700">
                Trang chủ
              </Link>
              <Link href="/viet" className="text-stone-700 hover:text-amber-700">
                Viết truyện
              </Link>
              <Link href="/nhap" className="text-stone-700 hover:text-amber-700">
                Nhập truyện gốc
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="border-t border-stone-200 py-6 text-center text-xs text-stone-500">
          Website cá nhân — dữ liệu lưu trên trình duyệt cho tới khi nối Supabase.
          Chưa có đăng nhập.
        </footer>
      </body>
    </html>
  );
}
