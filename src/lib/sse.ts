import { isStreamFrame, type StreamFrame } from "./stream-protocol";

/**
 * SSE 帧解析器（客户端手写实现）。
 *
 * 四个必须写对的细节，每一个都对应一个真实的坑：
 *   1. TextDecoder({ stream: true }) —— UTF-8 一个汉字 3 字节，
 *      被 chunk 边界切开时必须把残字节留在解码器内部，否则乱码；
 *   2. 跨 chunk 的缓冲区 —— 一次 read 可能只有半帧，按 \n\n 切；
 *   3. 跳过注释帧（`: ping`）—— 保活帧不是数据；
 *   4. 单帧解析失败不能中断整条流 —— 记一笔继续。
 */
export function createSseParser(
  onFrame: (frame: StreamFrame) => void,
  onMalformed?: (raw: string, error: unknown) => void,
): (chunk: Uint8Array) => void {
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  return function feed(chunk: Uint8Array): void {
    buffer += decoder.decode(chunk, { stream: true });

    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const rawFrame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      // 一帧里可能有多行 data:，按规范用 \n 连接
      const dataLines: string[] = [];
      for (const line of rawFrame.split(/\r?\n/)) {
        if (line === "" || line.startsWith(":")) continue; // 注释/保活
        if (!line.startsWith("data:")) continue;
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }

      if (dataLines.length === 0) continue;

      const payload = dataLines.join("\n");
      try {
        const parsed: unknown = JSON.parse(payload);
        if (isStreamFrame(parsed)) {
          onFrame(parsed);
        } else {
          onMalformed?.(payload, new Error("未知帧类型"));
        }
      } catch (error) {
        onMalformed?.(payload, error);
      }
    }
  };
}
