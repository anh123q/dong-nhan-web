"use client";

import { getStorageMode } from "@/lib/data";

/**
 * Banner nhỏ cho biết dữ liệu đang lưu ở đâu:
 * localStorage (chưa có Supabase) hay Supabase cloud.
 */
export default function StorageBanner() {
  const mode = getStorageMode();
  if (mode === "supabase") {
    return (
      <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
        ☁️ Đã nối Supabase — dữ liệu đang lưu trên cloud.
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
      💾 Chưa nối Supabase — dữ liệu đang lưu tạm trên trình duyệt này
      (localStorage). Xem README để nối cloud.
    </div>
  );
}
