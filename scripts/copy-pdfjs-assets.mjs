#!/usr/bin/env node
/**
 * 把 pdfjs-dist 的运行时资源复制到 public/pdfjs/。
 *
 * 为什么需要这一步：
 *   1. worker 必须是可独立加载的文件，写死 URL 比依赖打包器解析更可控；
 *   2. 中文 PDF 大量使用 CID 字体，缺少 cmaps 会导致文字抽取失败或乱码；
 *   3. 部分 PDF 使用未嵌入的标准字体，需要 standard_fonts。
 *
 * 这些是第三方产物，不提交进 git，由 predev / prebuild 自动生成。
 */

import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "pdfjs-dist");
const dest = path.join(root, "public", "pdfjs");

const worker = path.join(src, "build", "pdf.worker.min.mjs");

if (!existsSync(worker)) {
  console.error(
    "[pdfjs] 找不到 node_modules/pdfjs-dist，请先运行 npm install",
  );
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

const tasks = [
  [worker, path.join(dest, "pdf.worker.min.mjs")],
  [path.join(src, "cmaps"), path.join(dest, "cmaps")],
  [path.join(src, "standard_fonts"), path.join(dest, "standard_fonts")],
];

for (const [from, to] of tasks) {
  if (!existsSync(from)) {
    console.warn(`[pdfjs] 跳过缺失资源：${path.relative(root, from)}`);
    continue;
  }
  cpSync(from, to, { recursive: true });
}

console.log("[pdfjs] 资源已就绪：public/pdfjs/");
