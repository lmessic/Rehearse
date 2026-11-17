"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useParams } from "next/navigation";

const mockVerdicts = [
  {
    verdict: "含糊",
    text: "只说了「用 SSE 做流式」，没有说清为什么不选 WebSocket。",
    suggestion: "补一句选型依据：网关鉴权复用、无需上行、自带断点续传。",
  },
  {
    verdict: "到位",
    text: "讲清了 200 个 chunk 会触发 200 次渲染，并给了 rAF 合批的解法。",
    suggestion: "可以再加一句：合批只能合并文本增量，结构化事件必须保序。",
  },
  {
    verdict: "缺证据",
    text: "提到「性能提升明显」，但没有给出任何数字或测量方式。",
    suggestion: "换成具体口径：TTFT 从 X 降到 Y，或降级率从 A 到 B。",
  },
];

const badge: Record<string, string> = {
  到位: "bg-emerald-100 text-emerald-700",
  含糊: "bg-amber-100 text-amber-700",
  缺证据: "bg-rose-100 text-rose-700",
};

/**
 * 报告页骨架。
 *
 * 与做题页同理：URL 数据必须在 <Suspense> 内读取，否则阻塞预渲染。
 * 正式实现后会由 /api/report 返回结构化结果，每条判定必须引用候选人原文。
 */
export default function ReportPage() {
  return (
    <Suspense fallback={<PageSkeleton heading="复盘报告" />}>
      <ReportBody />
    </Suspense>
  );
}

function ReportBody() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 mb-1">报告 {id}</p>
          <h1 className="text-xl font-semibold">复盘报告</h1>
        </div>
        <span className="px-2 py-1 rounded bg-amber-100 text-amber-700 text-xs dark:bg-amber-900/40 dark:text-amber-300">
          示例数据
        </span>
      </div>

      <p className="mb-5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        下面是示例排版。正式版本里，每一条判定都必须引用你的原文——引不出原文就判「含糊」，
        这是防止模型凭空评价的约束。
      </p>

      <ul className="space-y-3">
        {mockVerdicts.map((item, i) => (
          <li
            key={i}
            className="p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
          >
            <div className="flex items-start gap-3">
              <span
                className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${badge[item.verdict]}`}
              >
                {item.verdict}
              </span>
              <div className="min-w-0">
                <p className="text-sm leading-relaxed mb-2">{item.text}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  <span className="text-slate-400">改进：</span>
                  {item.suggestion}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Link
        href="/session/demo"
        className="inline-block mt-8 text-sm text-blue-600 hover:underline"
      >
        ← 回到做题页
      </Link>
    </div>
  );
}

function PageSkeleton({ heading }: { heading: string }) {
  return (
    <div className="py-8">
      <p className="text-xl font-semibold mb-6">{heading}</p>
      <div className="mb-3 h-20 rounded-xl bg-slate-200/60 dark:bg-slate-800 animate-pulse" />
      <div className="mb-3 h-20 rounded-xl bg-slate-200/60 dark:bg-slate-800 animate-pulse" />
      <div className="mb-3 h-20 rounded-xl bg-slate-200/60 dark:bg-slate-800 animate-pulse" />
    </div>
  );
}
