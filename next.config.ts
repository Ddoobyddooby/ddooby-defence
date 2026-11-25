import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // MOB-01: Android 앱(Capacitor)은 정적 파일(out/)을 앱에 넣어 실행한다. 서버 기능은 쓰지 않는다.
  output: "export",
  // cacheComponents·partialPrefetching(PPR)는 정적 내보내기와 함께 쓸 수 없어 제거(사용처 없음).
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
