"use client";

import { useMemo, useState } from "react";
import type { ApiErrorBody } from "@/lib/schemas";
import type { ResumePoint } from "@/lib/schemas";
import { MIN_RESUME_CHARS } from "@/lib/constants";

type Phase = "idle" | "submitting" | "success" | "error";

interface ParseResponse {
  points: ResumePoint[];
  truncated: boolean;
}

const SAMPLE_RESUME = `李劭然，前端开发工程师，八年经验。

2025.11 至今 上海微创软件，负责京东商城 App 售后模块。
参与 AI 智能申请售后新功能，用户语音输入后由模型识别诉求并推荐处理方案，
基于 SSE 实现流式渲染，申请步骤由 5 步缩短至 2 步。
主导原有 React Native 业务向 Taro 多端框架迁移改造。

2022.10 - 2025.06 中科创达，负责荣耀智慧空间 React Native 端 AI 语音交互。
封装语音交互组件，以状态机管理待唤醒、聆听、识别中、播报、异常五种状态。
针对弱网场景设计环形缓存加延迟补偿策略，音频完整率由 92% 提升至 99.6%。

2018.07 - 2022.09 北京天融信，负责安全管控平台网络拓扑可视化模块。
基于 AntV G6 实现万级节点拓扑，采用视口裁剪与节点聚合，首帧渲染由 6s 降至 1.5s。`;

const RISK_STYLE: Record<string, string> = {
  high: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  mid: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

const RISK_LABEL: Record<string, string> = {
  high: "高风险",
  mid: "中风险",
  low: "低风险",
};

const ERROR_HINT: Record<string, string> = {
  BAD_REQUEST: "请求内容有问题，看上面的具体说明。",
  CONFIG_MISSING: "在项目根目录的 .env.local 里填写 DEEPSEEK_API_KEY，然后重启 dev server。",
  CONFIG_INVALID:
    "当前密钥无效。DeepSeek 的密钥必须以 sk- 开头，请到 platform.deepseek.com 重新生成，改完记得重启。",
  UPSTREAM_TIMEOUT: "模型响应超时，稍后重试即可。",
  UPSTREAM_ERROR: "模型服务异常，可以重试；持续失败就去看终端日志。",
  INVALID_JSON: "模型这次没按格式返回，重试一次通常就好。",
};

export default function ParsePanel() {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [error, setError] = useState<ApiErrorBody["error"] | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const charCount = text.trim().length;
  const tooShort = charCount < MIN_RESUME_CHARS;
  const canSubmit = !tooShort && phase !== "submitting";

  const lengthHint = useMemo(() => {
    if (charCount === 0) return `至少需要 ${MIN_RESUME_CHARS} 个字符`;
    if (tooShort) return `还差 ${MIN_RESUME_CHARS - charCount} 个字符`;
    return `${charCount} 个字符`;
  }, [charCount, tooShort]);

  async function handleSubmit() {
    if (!canSubmit) return;

    setPhase("submitting");
    setError(null);
    setResult(null);
    setElapsedMs(null);
    setCopied(false);

    const startedAt = performance.now();

    try {
      const response = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ text }),
      });

      const elapsed = Math.round(performance.now() - startedAt);
      setElapsedMs(elapsed);

      const payload: unknown = await response.json();

      if (!response.ok) {
        const body = payload as ApiErrorBody;
        setError(
          body?.error ?? {
            code: "UPSTREAM_ERROR",
            message: `请求失败（HTTP ${response.status}）`,
          },
        );
        setPhase("error");
        return;
      }

      setResult(payload as ParseResponse);
      setPhase("success");
    } catch (err) {
      setElapsedMs(Math.round(performance.now() - startedAt));
      setError({
        code: "UPSTREAM_ERROR",
        message: err instanceof Error ? err.message : "网络请求失败",
      });
      setPhase("error");
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(result, null, 2),
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 输入区 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="resume" className="text-sm font-medium">
            简历正文
          </label>
          <div className="flex items-center gap-3">
            <span
              className={`text-xs ${
                tooShort ? "text-amber-600 dark:text-amber-400" : "text-slate-400"
              }`}
            >
              {lengthHint}
            </span>
            <button
              type="button"
              onClick={() => setText(SAMPLE_RESUME)}
              className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              填入示例
            </button>
          </div>
        </div>

        <textarea
          id="resume"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          spellCheck={false}
          placeholder="把简历正文粘贴到这里（纯文本即可，至少 80 个字符）"
          className="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm leading-relaxed outline-none focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {phase === "submitting" ? "解析中…" : "开始解析"}
          </button>

          {text.length > 0 && phase !== "submitting" && (
            <button
              type="button"
              onClick={() => {
                setText("");
                setResult(null);
                setError(null);
                setPhase("idle");
                setElapsedMs(null);
              }}
              className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              清空
            </button>
          )}

          {elapsedMs !== null && (
            <span className="text-xs text-slate-400">耗时 {elapsedMs} ms</span>
          )}
        </div>
      </section>

      {/* 错误 */}
      {phase === "error" && error && (
        <section
          role="alert"
          aria-live="polite"
          className="rounded-xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900/60 dark:bg-rose-950/40"
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">
              解析失败
            </span>
            <code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700 dark:bg-rose-900/60 dark:text-rose-200">
              {error.code}
            </code>
          </div>
          <p className="text-sm text-rose-800 dark:text-rose-200">{error.message}</p>
          {ERROR_HINT[error.code] && (
            <p className="mt-2 text-sm text-rose-700/80 dark:text-rose-300/80">
              {ERROR_HINT[error.code]}
            </p>
          )}
        </section>
      )}

      {/* 结果 */}
      {phase === "success" && result && (
        <section aria-live="polite" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              抽出 {result.points.length} 个项目点
              {result.truncated && (
                <span className="ml-2 text-xs font-normal text-amber-600 dark:text-amber-400">
                  简历过长，已截断
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              {copied ? "已复制" : "复制 JSON"}
            </button>
          </div>

          <ul className="space-y-3">
            {result.points.map((point, index) => (
              <li
                key={`${point.title}-${index}`}
                className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h3 className="font-medium leading-snug">{point.title}</h3>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs ${
                      RISK_STYLE[point.risk] ?? RISK_STYLE.low
                    }`}
                  >
                    {RISK_LABEL[point.risk] ?? point.risk}
                  </span>
                </div>

                <p className="mb-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  <span className="text-slate-400">为什么要追问：</span>
                  {point.whyAsked}
                </p>

                <blockquote className="border-l-2 border-slate-300 pl-3 text-sm leading-relaxed text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  {point.evidence}
                </blockquote>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 空态 */}
      {phase === "idle" && (
        <p className="text-sm text-slate-400">
          解析结果会显示在这里。点击「填入示例」可以先用一份示例简历试试。
        </p>
      )}
    </div>
  );
}
