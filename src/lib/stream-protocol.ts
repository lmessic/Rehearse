/**
 * 流式帧协议（前后端共享）。
 *
 * 为什么不直接把模型厂商的 SSE 格式透传给前端：
 *   1. 各家格式不同，前端不该知道背后是哪家；
 *   2. 需要附加业务事件（meta / usage / done / error），原生 SSE 没有；
 *   3. 换模型时前端零改动。
 */

export type StreamFrame =
  | { t: "meta"; id: string }
  | { t: "delta"; v: string }
  | { t: "usage"; input: number; output: number }
  | { t: "done" }
  | { t: "error"; code: string; message?: string };

/** SSE 响应头。四个都必须齐，缺一个都可能被中间层缓冲。 */
export const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  // no-transform 阻止代理压缩缓冲，否则流会变成一次性返回
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // nginx 类网关的缓冲开关
  "X-Accel-Buffering": "no",
};

/** 保活帧：注释行不会触发 message 事件，但能让网关保持连接 */
export const KEEPALIVE_FRAME = ": ping\n\n";

/** 把一帧编码成 SSE 文本 */
export function encodeFrame(frame: StreamFrame): string {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

/** 帧的运行时校验，前端收到脏数据时不至于抛异常 */
export function isStreamFrame(value: unknown): value is StreamFrame {
  if (typeof value !== "object" || value === null) return false;
  const t = (value as { t?: unknown }).t;
  return (
    t === "meta" || t === "delta" || t === "usage" || t === "done" || t === "error"
  );
}
