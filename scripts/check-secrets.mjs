#!/usr/bin/env node
/**
 * 密钥泄露自检。
 *
 * 扫描 git 已跟踪的文件，找出常见的明文密钥特征。
 * 用法：
 *   npm run check:secrets
 *
 * 建议同时装成 pre-commit 钩子（见 README「密钥管理」一节），
 * 在提交前拦一道，而不是等 CI 或人眼发现。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const PATTERNS = [
  { name: "DeepSeek / OpenAI 风格密钥", re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { name: "AWS Access Key", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "GitHub Token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  {
    name: "疑似硬编码密钥赋值",
    re: /(?:api[_-]?key|apikey|secret|access[_-]?token)\s*[:=]\s*["'][A-Za-z0-9_\-]{20,}["']/gi,
  },
];

/** 占位符不算泄露：xxx、placeholder、$VAR、重复字符等 */
function isPlaceholder(value) {
  const lower = value.toLowerCase();
  if (
    lower.includes("placeholder") ||
    lower.includes("example") ||
    lower.includes("your") ||
    lower.includes("redacted") ||
    lower.includes("***") ||
    value.includes("${") ||
    value.includes("<")
  ) {
    return true;
  }
  // 同一个字符重复 8 次以上，基本就是 xxx 或 0000
  const body = value.replace(/^sk-/, "");
  return /(.)\1{7,}/.test(body);
}

const SKIP_FILES = new Set(["package-lock.json", "pnpm-lock.yaml"]);
const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|zip|woff2?|ttf|otf|mp4|mp3)$/i;

function trackedFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  return out.split("\0").filter(Boolean);
}

const findings = [];

for (const file of trackedFiles()) {
  if (SKIP_FILES.has(file) || BINARY_EXT.test(file)) continue;

  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  // 跳过明显的大文件，避免拖慢
  if (content.length > 1_000_000) continue;

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      for (const match of line.matchAll(re)) {
        if (isPlaceholder(match[0])) continue;
        findings.push({
          file,
          line: index + 1,
          pattern: name,
          // 只输出首尾，中间打码——避免自检工具本身变成泄露源
          preview: `${match[0].slice(0, 4)}…${match[0].slice(-2)}`,
        });
      }
    }
  });
}

if (findings.length === 0) {
  console.log("✅ 未在已跟踪文件中发现明文密钥");
  process.exit(0);
}

console.error(`❌ 发现 ${findings.length} 处疑似明文密钥：\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.pattern}]  ${f.preview}`);
}
console.error(`
处理方式：
  1. 立刻到对应平台吊销该密钥（先吊销，再改代码）
  2. 把密钥移进 .env.local（已被 git 忽略）
  3. 用 git filter-repo 或 BFG 清理历史，或直接更换全部密钥
`);
process.exit(1);
