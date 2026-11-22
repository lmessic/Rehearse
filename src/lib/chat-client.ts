import { createSseParser } from "./sse";
import type { StreamFrame } from "./stream-protocol";

/**
 * 聊天接口地址。
 *
 * 当前页面通过本地 Express 服务 9527 端口调用模型。
 * 如果部署环境使用反向代理，可以在这里改成相对地址或环境变量。
 */
export const CHAT_API_URL = "http://localhost:9527/api/chat";

type ChatErrorPayload = {
  error?: {
    message?: string;
  };
};

/**
 * 发起聊天请求，并负责读取 HTTP 层错误。
 *
 * - query 只发送用户的原始文本；页面只负责展示和本地消息状态。
 * - signal 来自 AbortController，用户停止生成时会中断 fetch。
 * - 成功后返回 ReadableStream，由 consumeChatStream 逐 chunk 解析。
 */
export async function createChatRequest(
  query: string,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetch(CHAT_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  });

  // HTTP 400/500 等不会进入正常 SSE 响应，先读取普通 JSON 错误。
  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as ChatErrorPayload | null;
    throw new Error(
      payload?.error?.message ?? `请求失败（HTTP ${response.status}）`,
    );
  }

  if (!response.body) {
    throw new Error("服务没有返回可读取的响应流");
  }

  return response.body;
}

/**
 * 持续消费 Express 返回的 SSE 响应流。
 *
 * createSseParser 会处理跨 chunk、半帧、UTF-8 截断和脏帧；
 * 调用方只需要接收已经校验过的 meta/delta/done/error 业务帧。
 */
export async function consumeChatStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: StreamFrame) => void,
): Promise<void> {
  const reader = body.getReader();
  const parser = createSseParser(onFrame);

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parser(value);
    }
  } finally {
    reader.releaseLock();
  }
}
