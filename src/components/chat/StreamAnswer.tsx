"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSseParser } from "@/lib/sse";
import MarkdownStream from "./MarkdownStream";

/**
 * 流式作答面板。
 *
 * 这一版包含三件核心能力：
 *   1. 手写 SSE 帧解析（半包、UTF-8 截断、保活帧、坏帧容错）；
 *   2. rAF 合批——chunk 累积到 ref，一帧只提交一次 setState，
 *      否则 200 个 chunk 就是 200 次渲染；
 *   3. 可中断——AbortController 断开后服务端能感知并停止调用模型。
 *
 * 完整的状态机（迁移表、非法迁移断言、降级与埋点）留到 W3。
 */

type Phase =
  | "idle"
  | "preparing"
  | "streaming"
  | "done"
  | "cancelled"
  | "failed";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "未开始",
  preparing: "等待首字节",
  streaming: "生成中",
  done: "已完成",
  cancelled: "已停止",
  failed: "失败",
};

const PHASE_STYLE: Record<Phase, string> = {
  idle: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300",
  preparing: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  streaming: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  cancelled: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  failed: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const MIN_ANSWER_CHARS = 10;

export default function StreamAnswer({ question }: { question: string }) {
  const [answer, setAnswer] = useState("");
  const [output, setOutput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<{ code: string; message?: string } | null>(
    null,
  );
  const [ttft, setTtft] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pendingRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  // ---- rAF 合批 ----
  const flush = useCallback(() => {
    rafRef.current = null;
    const chunk = pendingRef.current;
    if (!chunk) return;
    pendingRef.current = "";
    setOutput((prev) => prev + chunk);
  }, []);

  const flushNow = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const chunk = pendingRef.current;
    if (!chunk) return;
    pendingRef.current = "";
    setOutput((prev) => prev + chunk);
  }, []);

  // 卸载时收尾：中断请求、取消挂起的 rAF
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const busy = phase === "preparing" || phase === "streaming";
  const canStart = !busy && answer.trim().length >= MIN_ANSWER_CHARS;

  async function start() {
    if (!canStart) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setPhase("preparing");
    setOutput("");
    setError(null);
    setTtft(null);
    setElapsed(null);
    pendingRef.current = "";

    const startedAt = performance.now();
    let firstByteAt: number | null = null;
    let failedByFrame = false;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: `简历里的项目问题：${question}\n\n候选人的回答：\n${answer}`,
            },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { code?: string; message?: string } }
          | null;
        throw new Error(
          payload?.error?.message ?? `请求失败（HTTP ${response.status}）`,
        );
      }

      const reader = response.body.getReader();

      const parse = createSseParser((frame) => {
        if (frame.t === "delta") {
          if (firstByteAt === null) {
            firstByteAt = performance.now();
            setTtft(Math.round(firstByteAt - startedAt));
            setPhase("streaming");
          }
          pendingRef.current += frame.v;
          if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(flush);
          }
        } else if (frame.t === "done") {
          setPhase("done");
        } else if (frame.t === "error") {
          failedByFrame = true;
          setError({ code: frame.code, message: frame.message });
          setPhase("failed");
        }
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parse(value);
      }

      flushNow();
      if (!failedByFrame && mountedRef.current) {
        setPhase((prev) => (prev === "failed" ? prev : "done"));
      }
    } catch (err) {
      flushNow();
      const name = (err as Error)?.name;
      if (name === "AbortError") {
        if (mountedRef.current) setPhase("cancelled");
      } else if (mountedRef.current) {
        setError({
          code: "UPSTREAM_ERROR",
          message: (err as Error)?.message ?? "网络请求失败",
        });
        setPhase("failed");
      }
    } finally {
      if (mountedRef.current) {
        setElapsed(Math.round(performance.now() - startedAt));
      }
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  return (
    <div className="space-y-4">
      {/* 作答输入 */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="answer" className="text-sm font-medium">
            你的回答
          </label>
          <span className="text-xs text-slate-400">
            {answer.trim().length} 个字符
            {answer.trim().length < MIN_ANSWER_CHARS &&
              `（至少 ${MIN_ANSWER_CHARS} 个）`}
          </span>
        </div>

        <textarea
          id="answer"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={6}
          disabled={busy}
          placeholder="像在真实面试里一样，把这一题完整答一遍"
          className="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm leading-relaxed outline-none focus:border-blue-500 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900"
        />

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={start}
            disabled={!canStart}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {phase === "done" || phase === "cancelled" || phase === "failed"
              ? "重新作答"
              : "开始作答"}
          </button>

          {busy && (
            <button
              type="button"
              onClick={stop}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
            >
              停止
            </button>
          )}

          <span
            className={`rounded px-2 py-0.5 text-xs ${PHASE_STYLE[phase]}`}
          >
            {PHASE_LABEL[phase]}
          </span>

          {ttft !== null && (
            <span className="text-xs text-slate-400">
              首字 {ttft} ms
            </span>
          )}
          {elapsed !== null && (
            <span className="text-xs text-slate-400">总计 {elapsed} ms</span>
          )}
        </div>
      </section>

      {/* 错误 */}
      {error && (
        <section
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/40"
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-semibold text-rose-700 dark:text-rose-300">
              出错了
            </span>
            <code className="rounded bg-rose-100 px-1.5 py-0.5 text-xs text-rose-700 dark:bg-rose-900/60 dark:text-rose-200">
              {error.code}
            </code>
          </div>
          <p className="text-sm text-rose-800 dark:text-rose-200">
            {error.message ?? "请稍后重试"}
          </p>
          {error.code === "CONFIG_INVALID" && (
            <p className="mt-1 text-sm text-rose-700/80 dark:text-rose-300/80">
              密钥无效：确认 DEEPSEEK_API_KEY 以 sk- 开头，改完重启 dev server。
            </p>
          )}
        </section>
      )}

      {/* 流式输出 */}
      {(phase !== "idle" || output) && (
        <section
          aria-live="polite"
          className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">面试官的反馈</h2>
            {phase === "streaming" && (
              <span className="text-xs text-slate-400">接收中…</span>
            )}
          </div>

          {output ? (
            <MarkdownStream text={output} streaming={phase === "streaming"} />
          ) : phase === "preparing" ? (
            <p className="text-sm text-slate-400">等待模型响应…</p>
          ) : (
            <p className="text-sm text-slate-400">（没有内容）</p>
          )}
        </section>
      )}
    </div>
  );
}
