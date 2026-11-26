import { SSEClient, type SSEClientOptions } from "./sse-client";

/**
 * 聊天接口地址。
 *
 * 当前聊天面板通过本地 Express 服务调用模型；部署时可以改为代理地址。
 */
export const CHAT_API_URL = "http://localhost:9527/api/chat";

export type ChatRequestMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatClientCallbacks = Pick<
  SSEClientOptions,
  "signal" | "onFrame" | "onError" | "onRetry" | "onStateChange"
>;

/**
 * 创建聊天用 SSE 客户端。
 *
 * 把聊天请求的 URL、方法和 JSON 请求体集中在这里；连接、解析、
 * 取消及重试由 SSEClient 负责。
 */
export function createChatClient(
  messages: ChatRequestMessage[],
  callbacks: ChatClientCallbacks = {},
): SSEClient {
  return new SSEClient({
    url: CHAT_API_URL,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    ...callbacks,
  });
}
