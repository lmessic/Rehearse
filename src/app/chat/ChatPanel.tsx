"use client";

import { useEffect, useRef } from "react";
import MarkdownStream from "@/components/chat/MarkdownStream";
import { useChatPanel } from "./useChatPanel";

/**
 * 聊天页面的纯展示组件。
 *
 * 网络请求、SSE 消费、请求取消、rAF 合批等状态逻辑由 useChatPanel 管理；
 * 此组件只负责页面结构、输入控件和消息列表渲染。
 */
export default function ChatPanel() {
  const {
    messages,
    input,
    setInput,
    isStreaming,
    sendMessage,
    stopMessage,
  } = useChatPanel();
  const endRef = useRef<HTMLDivElement | null>(null);

  // 每次消息变化或流式状态变化时滚到底部，让最新回复始终可见。
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  return (
    <div className="flex h-[calc(100vh-8.5rem)] min-h-[520px] flex-col py-4">
      <header className="mb-4 shrink-0">
        <p className="mb-1 text-xs text-slate-400">面试练习</p>
        <h1 className="text-xl font-semibold">自由对话</h1>
      </header>

      {/* 消息区域：用户消息靠右，助理消息靠左，并在末尾保留滚动锚点。 */}
      <section className="flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={`${index}-${message.role}`}
              className={`flex ${
                message.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-4 py-3 ${
                  message.role === "user"
                    ? "bg-blue-600 text-white"
                    : "border border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                }`}
              >
                {message.role === "assistant" ? (
                  <MarkdownStream
                    text={message.content}
                    streaming={
                      isStreaming &&
                      index === messages.length - 1 &&
                      message.content.length > 0
                    }
                  />
                ) : (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {message.content}
                  </p>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </section>

      {/* 输入区域：流式生成时禁用输入并显示停止按钮。 */}
      <form
        onSubmit={sendMessage}
        className="mt-4 flex shrink-0 gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            // Enter 提交；Shift+Enter 保留换行，适合输入较长的项目经历。
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          disabled={isStreaming}
          placeholder="输入你想练习的问题或项目经历"
          className="min-h-12 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none disabled:opacity-60"
        />

        {isStreaming ? (
          <button
            type="button"
            onClick={stopMessage}
            className="self-end rounded-lg border border-slate-300 px-4 py-2 text-sm transition hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700"
          >
            停止
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim()}
            className="self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            发送
          </button>
        )}
      </form>
    </div>
  );
}
