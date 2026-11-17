import Link from "next/link";

const highlights = [
  {
    title: "流式渲染做到不闪、不吞字、可中断",
    desc: "未闭合的代码块先降级渲染、闭合后升级高亮；中文跨 chunk 不乱码；随时可打断，服务端能感知并停止计费。",
  },
  {
    title: "状态机不是 loading / success / error",
    desc: "模型慢、模型不准、用户主动取消，三种情况走三条不同路径。降级是一个终态，不是错误。",
  },
  {
    title: "把「慢」和「不准」分开度量",
    desc: "记录 TTFT（首字时间）与总时长，也记录每题判定与降级原因。混成一个指标是最常见的度量错误。",
  },
];

const roadmap = [
  { week: "W1", text: "骨架上线 + 简历解析", done: true },
  { week: "W2", text: "流式作答（手写 SSE 解析）", done: false },
  { week: "W3", text: "状态机 + 中断 + 降级", done: false },
  { week: "W4", text: "复盘报告 + 示例体验", done: false },
];

export default function HomePage() {
  return (
    <div className="py-10">
      <section className="mb-12">
        <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-3">
          Rehearse · 追问
        </p>
        <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-4">
          用你的简历，练你的面试
        </h1>
        <p className="text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
          把简历丢进去，它从你的项目里挖出面试官一定会追问的点，逐题陪你练，
          最后给一份能直接改进的复盘报告。
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/parse"
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
          >
            粘贴简历，试试解析
          </Link>
          <Link
            href="/session/demo"
            className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-white dark:hover:bg-slate-800 transition"
          >
            看一眼做题页
          </Link>
        </div>

        <p className="mt-4 text-xs text-slate-400">
          简历解析已可用（W1）；做题与复盘报告还在开发中。
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-lg font-semibold mb-4">它和「套壳 AI」的三处区别</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {highlights.map((item) => (
            <div
              key={item.title}
              className="p-4 rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
            >
              <h3 className="font-medium mb-2 leading-snug">{item.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-4">开发进度</h2>
        <ul className="space-y-2 max-w-xl">
          {roadmap.map((step) => (
            <li
              key={step.week}
              className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300"
            >
              <span className="w-10 shrink-0 font-mono text-xs text-slate-400">
                {step.week}
              </span>
              <span
                className={
                  step.done
                    ? "line-through text-slate-400"
                    : undefined
                }
              >
                {step.text}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
