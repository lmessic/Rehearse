"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { consumeChatStream, createChatRequest } from "@/lib/chat-client";

export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    role: "assistant",
    content: "你好，我是你的面试追问助手。可以先告诉我你想练习的项目经历。",
  },
];

/**
 * 聊天面板状态与请求逻辑。
 *
 * Hook 只负责业务状态，不生成任何 JSX：
 * - 维护消息列表、输入框、流式状态；
 * - 发起和停止后端请求；
 * - 将多个 SSE delta 合并后每帧只更新一次界面。
 */
export function useChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  // AbortController 用于主动取消 fetch，组件卸载时也会调用。
  const abortRef = useRef<AbortController | null>(null);

  // 网络 chunk 到达频率远高于浏览器渲染帧率；
  // 先存到 pendingRef，每个 rAF 周期合并后再提交一次 setMessages。
  const pendingRef = useRef("");
  const rafRef = useRef<number | null>(null);

  /**
   * rAF 合批回调：
   * 从缓存取出本帧累计的文本，追加到最后一条 assistant 消息。
   */
  const flushPending = useCallback(() => {
    rafRef.current = null;
    const chunk = pendingRef.current;
    if (!chunk) return;

    pendingRef.current = "";
    setMessages((current) =>
      current.map((message, index) =>
        index === current.length - 1 && message.role === "assistant"
          ? { ...message, content: message.content + chunk }
          : message,
      ),
    );
  }, []);

  /**
   * 组件卸载时取消进行中的请求，并取消尚未执行的 rAF，
   * 防止卸载后继续 setState 或继续读取网络流。
   */
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  function appendAssistantError(message: string) {
    pendingRef.current += `\n\n请求失败：${message}`;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushPending);
    }
  }

  /**
   * 提交表单后的完整请求生命周期：
   * 1. 校验输入并阻止重复发送；
   * 2. 在本地列表中追加用户消息和空的助理占位消息；
   * 3. 创建 AbortController；
   * 4. 等待 Express 响应流；
   * 5. 收到 delta 时合批追加，收到 error 时展示错误；
   * 6. finally 重置流式状态并清理 controller 引用。
   */
  async function sendMessage(event: FormEvent) {
    event.preventDefault();

    const text = input.trim();
    if (!text || isStreaming) return;

    setMessages((current) => [
      ...current,
      { role: "user", content: text },
      { role: "assistant", content: "" },
    ]);
    setInput("");
    setIsStreaming(true);
    pendingRef.current = "";

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const body = await createChatRequest(text, controller.signal);

      await consumeChatStream(body, (frame) => {
        if (frame.t === "delta") {
          pendingRef.current += frame.v;
          if (rafRef.current === null) {
            rafRef.current = requestAnimationFrame(flushPending);
          }
        } else if (frame.t === "error") {
          appendAssistantError(frame.message ?? frame.code);
        }
      });

      // 流正常结束前，立即刷新缓存中剩余的最后几个 delta，
      // 避免最后一个 rAF 尚未执行就丢掉尾部文字。
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      flushPending();
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        const message = (error as Error).message || "网络请求失败，请稍后重试";

        setMessages((current) => [
          ...current.slice(0, -1),
          { role: "assistant", content: `抱歉，${message}` },
        ]);
      }
    } finally {
      setIsStreaming(false);
      if (abortRef.current === controller) {
        abortRef.current = null;
      }
    }
  }

  function stopMessage() {
    // abort() 会触发 fetch 的 AbortError；finally 会负责恢复发送状态。
    abortRef.current?.abort();
  }

  return {
    messages,
    input,
    setInput,
    isStreaming,
    sendMessage,
    stopMessage,
  };
}
