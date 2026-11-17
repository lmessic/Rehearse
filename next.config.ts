import type { NextConfig } from "next";

/**
 * `output: "standalone"` 会产出精简运行时供 Docker 使用，
 * 但它与本地 `npm start` 不兼容（Next 会直接报错）。
 * 所以只在容器构建时通过 BUILD_STANDALONE=1 开启，本地保持默认。
 */
const standalone = process.env.BUILD_STANDALONE === "1";

const nextConfig: NextConfig = {
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
