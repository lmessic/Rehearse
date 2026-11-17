"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useParams } from "next/navigation";

/**
 * 做题页骨架。
 *
 * 注意：Cache Components 开启后，`useParams()` 这类 URL 数据必须在 <Suspense> 内读取，
 * 否则会在预渲染阶段阻塞整个路由。这里把读参数的组件包在 Suspense 里，
 * 让静态外壳先出来、参数相关的部分随后流入。
 *
 * 正式实现后会包含：
 *   - 题目卡片（含追问链）
 *   - 流式作答区（手写 SSE 解析 + rAF 合批）
 *   - 六态状态机指示
 *   - 中断 / 重答 / 下一题
 */
export default function SessionPage() {
  return (
    <Suspense fallback={<PageSkeleton heading="做题页" />}>
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
          <p className="text-xs text-slate-400 mb-1">会话 {id}</p>
          <h1 className="text-xl font-semibold">做题页</h1>
        </div>
        <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs dark:bg-amber-900/40 dark:text-amber-300">
          待实现
        </span>
      </div>

      <section className="mb-4 p-5 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <p className="text-xs text-slate-400 mb-2">
          第 1 / 5 题 · 来自「AI 智能申请售后」
        </p>
        <p className="font-medium leading-relaxed">
          你在京东售后做的 AI 智能申请，用户从说话到提交售后单，中间经过哪些步骤？
        </p>
      </section>

      <section className="mb-4 p-5 rounded-xl border border-dashed border-slate-300 bg-white/60 dark:border-slate-600 dark:bg-slate-800/60">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          <span className="text-xs text-slate-400">
            状态机：idle → preparing → streaming → done
          </span>
        </div>
        <p className="text-sm text-slate-400 leading-relaxed">
          流式作答区。这里会接入 SSE 帧解析、
          <code className="mx-1 px-1 rounded bg-slate-100 dark:bg-slate-700">
            TextDecoder({"{"} stream: true {"}"})
          </code>
          与 rAF 合批，并支持随时中断。
        </p>
      </section>

      <div className="flex gap-3">
        <button
          disabled
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm opacity-40 cursor-not-allowed"
        >
          开始作答
        </button>
        <button
          disabled
          className="px-4 py-2 rounded-lg border border-slate-300 text-sm opacity-40 cursor-not-allowed dark:border-slate-600"
        >
          停止
        </button>
        <Link
          href={`/report/${id}`}
          className="ml-auto text-sm text-blue-600 hover:underline self-center"
        >
          跳到报告 →
        </Link>
      </div>
    </div>
  );
}

function PageSkeleton({ heading }: { heading: string }) {
  return (
    <div className="py-8">
      <p className="text-xl font-semibold mb-6">{heading}</p>
      <div className="mb-4 h-24 rounded-xl bg-slate-200/60 dark:bg-slate-800 animate-pulse" />
      <div className="mb-4 h-32 rounded-xl bg-slate-200/60 dark:bg-slate-800 animate-pulse" />
    </div>
  );
}
