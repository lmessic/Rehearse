import { z } from "zod";
import { chatStream, LlmError } from "@/lib/llm";
import { MissingEnvError } from "@/lib/env";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompts";
import {
  encodeFrame,
  KEEPALIVE_FRAME,
  SSE_HEADERS,
  type StreamFrame,
} from "@/lib/stream-protocol";

/**
 * POST /api/chat
 *
 * 请求：{ messages: [{ role: "user" | "assistant", content: string }] }
 * 响应：text/event-stream，自定义帧协议（见 lib/stream-protocol.ts）
 *
 * 设计要点：
 *   1. system prompt 由服务端注入，客户端不能自带 system 角色
 *      —— 否则任何人都能改写面试官人格；
 *   2. 每 15 秒发一次 `: ping` 保活，防止网关掐断空闲连接；
 *   3. 客户端断开时 request.signal 触发，停止调用模型，避免白烧 token；
 *   4. 错误也通过帧返回，前端能拿到明确的 code，而不是干等。
 */

const MessageSchema = z.object({
  // 只允许 user / assistant：system 由服务端决定
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const BodySchema = z.object({
  messages: z.array(MessageSchema).min(1).max(20),
});

// 注意：开启 cacheComponents 后不允许导出 `runtime` 段配置，
// Route Handler 默认就在 Node 运行时，这里不需要声明。

export async function POST(request: Request) {
  const startedAt = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "BAD_REQUEST", message: "请求体不是合法 JSON" } },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return Response.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: `messages 不合法：${first?.path.join(".") ?? "?"} ${first?.message ?? ""}`,
        },
      },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const requestId = `chat_${Date.now().toString(36)}`;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (frame: StreamFrame) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeFrame(frame)));
        } catch {
          closed = true; // 客户端已断开
        }
      };

      // 保活：注释行不会触发前端的 message 事件，但能撑住连接
      const keepAlive = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(KEEPALIVE_FRAME));
        } catch {
          closed = true;
        }
      }, 15_000);

      let deltas = 0;
      let chars = 0;
      let cancelled = false;

      try {
        send({ t: "meta", id: requestId });

        for await (const delta of chatStream({
          messages: [
            { role: "system", content: CHAT_SYSTEM_PROMPT },
            ...parsed.data.messages,
          ],
          maxTokens: 800,
          timeoutMs: 120_000,
          signal: request.signal,
        })) {
          // 客户端走了就别再推进：这一层直接省掉后续 token
          if (request.signal.aborted) {
            cancelled = true;
            break;
          }
          send({ t: "delta", v: delta });
          deltas++;
          chars += delta.length;
        }

        if (!cancelled) send({ t: "done" });
      } catch (error) {
        if (request.signal.aborted) {
          cancelled = true;
        } else {
          const code =
            error instanceof MissingEnvError
              ? "CONFIG_MISSING"
              : error instanceof LlmError
                ? error.code
                : "UPSTREAM_ERROR";
          console.error(
            `[chat] id=${requestId} code=${code} msg=${(error as Error)?.message ?? ""}`,
          );
          send({
            t: "error",
            code,
            message: error instanceof LlmError ? error.message : undefined,
          });
        }
      } finally {
        clearInterval(keepAlive);
        console.info(
          `[chat] id=${requestId} deltas=${deltas} chars=${chars} cancelled=${cancelled} ms=${Date.now() - startedAt}`,
        );
        if (!closed) {
          try {
            controller.close();
          } catch {
            // 已经关了就算了
          }
        }
      }
    },

    cancel() {
      // 消费方取消（浏览器关页面/中止请求）时触发
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
