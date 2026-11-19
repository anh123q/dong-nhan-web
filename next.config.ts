import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Không cache trang ở phía client: dữ liệu truyện/chương thay đổi sau
  // mỗi lần lưu/xuất bản, cache cũ khiến danh sách chương hiển thị sai
  // khi điều hướng nội bộ trong web (lỗi thực tế 19/11/2026).
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 0,
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
