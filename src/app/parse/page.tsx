import type { Metadata } from "next";
import ParsePanel from "@/components/parse/ParsePanel";
import { MIN_RESUME_CHARS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "简历解析 · Rehearse",
  description: "把简历正文丢进去，抽出面试官最可能追问的项目点。",
};

export default function ParsePage() {
  return (
    <div className="py-8">
      <header className="mb-6">
        <p className="mb-1 text-xs text-slate-400">W1 · 简历解析</p>
        <h1 className="mb-2 text-2xl font-bold">从简历里找出最薄弱的项目点</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          粘贴简历正文（至少 {MIN_RESUME_CHARS} 个字符），模型会挑出 3–5
          个最可能被面试官追问的地方，并给出它判断的依据。
          每个项目点都必须附带简历原文摘录——引不出原文的点不会出现。
        </p>
      </header>

      <ParsePanel />

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400 dark:border-slate-700">
        当前只支持粘贴纯文本。PDF 上传与自动抽取文本是下一步。
      </footer>
    </div>
  );
}
