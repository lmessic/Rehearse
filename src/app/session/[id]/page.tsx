"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import StreamAnswer from "@/components/chat/StreamAnswer";

/**
 * 做题页。
 *
 * 注意：Cache Components 开启后，`useParams()` 这类 URL 数据必须在 <Suspense> 内读取，
 * 否则会在预渲染阶段阻塞整个路由。这里把读参数的组件包在 Suspense 里，
 * 让静态外壳先出来、参数相关的部分随后流入。
 *
 * W2 阶段：题目先用固定样例，作答已经走真实流式链路。
 * W3 会接上从简历解析出来的真实题目与状态机。
 */
const DEMO_QUESTION =
  "你在京东售后做的 AI 智能申请，用户从说话到提交售后单，中间经过哪些步骤？其中哪一步最容易出问题？";

export default function SessionPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SessionBody />
    </Suspense>
  );
}

function SessionBody() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="mb-1 text-xs text-slate-400">会话 {id}</p>
          <h1 className="text-xl font-semibold">做题页</h1>
        </div>
        <Link
          href={`/report/${id}`}
          className="text-sm text-blue-600 hover:underline"
        >
          跳到报告 →
        </Link>
      </div>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <p className="mb-2 text-xs text-slate-400">
          第 1 题 · 来自「AI 智能申请售后」
        </p>
        <p className="font-medium leading-relaxed">{DEMO_QUESTION}</p>
      </section>

      <StreamAnswer question={DEMO_QUESTION} />

      <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400 dark:border-slate-700">
        题目目前是固定样例；作答已走真实的流式链路（自解析 SSE + rAF 合批，可中断）。
      </footer>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="py-8">
      <p className="mb-6 text-xl font-semibold">做题页</p>
      <div className="mb-4 h-24 animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800" />
      <div className="mb-4 h-40 animate-pulse rounded-xl bg-slate-200/60 dark:bg-slate-800" />
    </div>
  );
}
