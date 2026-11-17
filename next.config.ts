import type { NextConfig } from "next";

/**
 * `output: "standalone"` 会产出精简运行时供 Docker 使用，
 * 但它与本地 `npm start` 不兼容（Next 会直接报错）。
 * 所以只在容器构建时通过 BUILD_STANDALONE=1 开启，本地保持默认。
 */
const standalone = process.env.BUILD_STANDALONE === "1";

// 允许用环境变量指定构建输出目录，用于在不干扰 dev server 的情况下做生产验证
const distDir = process.env.NEXT_DIST_DIR;

const nextConfig: NextConfig = {
  ...(distDir ? { distDir } : {}),
  ...(standalone ? { output: "standalone" as const } : {}),
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
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
