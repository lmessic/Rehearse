import { z } from "zod";
import { env, MissingEnvError } from "./env";

/**
 * DeepSeek 客户端（OpenAI 兼容协议）。
 *
 * 只做这一件事：给定 system + user，要求模型返回严格 JSON，
 * 用 zod 校验后返回。失败重试一次，仍失败则抛 LlmError。
 *
 * 不在这里做流式——流式在 /api/chat 里单独处理，
 * 因为两者的错误语义和重试策略完全不同。
 */

export type LlmErrorCode =
  | "CONFIG_MISSING"
  | "CONFIG_INVALID"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "INVALID_JSON";

export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/**
 * 值得重试的错误。
 * 4xx 不在其中：参数错了重试一百次也不会成功，只会白烧额度。
 */
const RETRYABLE: ReadonlySet<LlmErrorCode> = new Set([
  "UPSTREAM_TIMEOUT",
  "UPSTREAM_ERROR",
  "INVALID_JSON",
]);

interface ChatJsonOptions<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  timeoutMs?: number;
}

/** DeepSeek 返回体里我们真正用到的部分 */
interface ChatCompletion {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 模型偶尔会用 ```json 包裹输出，这里剥掉 */
function unwrapFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced ? fenced[1] : trimmed;
}

async function callOnce<T>(
  opts: ChatJsonOptions<T>,
): Promise<{ data: T; usage: ChatCompletion["usage"] }> {
  let apiKey: string;
  try {
    apiKey = env.deepseekApiKey;
  } catch (error) {
    if (error instanceof MissingEnvError) {
      throw new LlmError("CONFIG_MISSING", error.message);
    }
    throw error;
  }

  const url = `${env.deepseekBaseUrl.replace(/\/+$/, "")}/chat/completions`;

  // 快速的格式体检：DeepSeek 的密钥以 sk- 开头。
  // 不符合时只告警不拦截——万一以后换成别家兼容服务，不至于直接不能用。
  if (!apiKey.startsWith("sk-")) {
    console.warn(
      `[llm] DEEPSEEK_API_KEY 不以 sk- 开头（长度 ${apiKey.length}），可能不是 DeepSeek 平台的密钥`,
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env.deepseekModel,
        messages: [
          // 固定前缀：DeepSeek 的上下文缓存按前缀命中，system 不变就能吃到折扣
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
        // 注意：用 json_object 时，system 提示词里必须出现 "JSON" 这个词
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: opts.maxTokens ?? 1200,
        stream: false,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  } catch (error) {
    const name = (error as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      throw new LlmError("UPSTREAM_TIMEOUT", "模型响应超时");
    }
    throw new LlmError("UPSTREAM_ERROR", `请求模型失败：${name ?? "unknown"}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    // 401/403 是密钥问题，不是「服务暂时不可用」——重试没有意义，提示也要说清楚
    if (response.status === 401 || response.status === 403) {
      throw new LlmError(
        "CONFIG_INVALID",
        `模型鉴权失败（${response.status}）：${detail.slice(0, 200)}`,
      );
    }

    throw new LlmError(
      "UPSTREAM_ERROR",
      `模型返回 ${response.status}：${detail.slice(0, 200)}`,
    );
  }

  let payload: ChatCompletion;
  try {
    payload = (await response.json()) as ChatCompletion;
  } catch {
    throw new LlmError("UPSTREAM_ERROR", "模型返回体不是合法 JSON");
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new LlmError("INVALID_JSON", "模型没有返回内容");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(unwrapFence(content));
  } catch {
    throw new LlmError("INVALID_JSON", "模型输出不是合法 JSON");
  }

  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new LlmError(
      "INVALID_JSON",
      `模型输出不符合结构：${first?.path.join(".") ?? "?"} ${first?.message ?? ""}`,
    );
  }

  return { data: parsed.data, usage: payload.usage };
}

/**
 * 请求模型并返回通过 schema 校验的结构化数据。
 * 可重试的错误会退避重试一次；不可重试的直接抛。
 */
export async function chatJson<T>(opts: ChatJsonOptions<T>): Promise<T> {
  let lastError: LlmError | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await callOnce(opts);
      return data;
    } catch (error) {
      const llmError =
        error instanceof LlmError
          ? error
          : new LlmError("UPSTREAM_ERROR", String(error));

      lastError = llmError;
      if (!RETRYABLE.has(llmError.code) || attempt === 1) break;

      await sleep(800);
    }
  }

  throw lastError ?? new LlmError("UPSTREAM_ERROR", "未知错误");
}

// ---------------------------------------------------------------------------
// 流式
// ---------------------------------------------------------------------------

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatStreamOptions {
  messages: ChatMessage[];
  maxTokens?: number;
  /** 整体超时；为 0 表示不设上限（由调用方通过 signal 控制） */
  timeoutMs?: number;
  /** 外部取消信号，通常是 request.signal */
  signal?: AbortSignal;
}

/**
 * 把上游的流式响应转成「文本增量」异步生成器。
 *
 * 只负责最底层的搬运：
 *   - 处理 DeepSeek 的 `data: {...}` / `data: [DONE]` 帧；
 *   - 只取 choices[0].delta.content，其余（role 帧、usage 帧）忽略；
 *   - 消费方 break 或抛错时，取消底层 reader，避免连接悬挂。
 */
export async function* chatStream(
  opts: ChatStreamOptions,
): AsyncGenerator<string, void, unknown> {
  const apiKey = env.deepseekApiKey; // 缺失时抛 MissingEnvError，由调用方转换
  const url = `${env.deepseekBaseUrl.replace(/\/+$/, "")}/chat/completions`;

  // 手动合并「外部取消」与「整体超时」两种中止来源
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onExternalAbort, { once: true });
  const timer =
    opts.timeoutMs && opts.timeoutMs > 0
      ? setTimeout(() => controller.abort(), opts.timeoutMs)
      : null;

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: env.deepseekModel,
        messages: opts.messages,
        stream: true,
        temperature: 0.7,
        max_tokens: opts.maxTokens ?? 800,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403) {
        throw new LlmError(
          "CONFIG_INVALID",
          `模型鉴权失败（${response.status}）：${detail.slice(0, 200)}`,
        );
      }
      throw new LlmError(
        "UPSTREAM_ERROR",
        `模型返回 ${response.status}：${detail.slice(0, 200)}`,
      );
    }

    if (!response.body) {
      throw new LlmError("UPSTREAM_ERROR", "模型没有返回流");
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let boundary: number;
      while ((boundary = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 1);

        if (!line.startsWith("data:")) continue; // 空行、注释、event: 等
        const payload = line.slice(5).trim();
        if (payload === "" || payload === "[DONE]") continue;

        let frame: {
          choices?: Array<{ delta?: { content?: string | null } }>;
        };
        try {
          frame = JSON.parse(payload);
        } catch {
          continue; // 半截帧，跳过
        }

        const delta = frame.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          yield delta;
        }
      }
    }
  } catch (error) {
    // 被取消：交给调用方判断，不当作错误
    if (controller.signal.aborted) {
      const isExternal = opts.signal?.aborted === true;
      if (isExternal) return; // 客户端主动断开，安静结束
      throw new LlmError("UPSTREAM_TIMEOUT", "模型响应超时");
    }
    if (error instanceof LlmError) throw error;
    throw new LlmError(
      "UPSTREAM_ERROR",
      `流式读取失败：${(error as Error)?.message ?? "未知错误"}`,
    );
  } finally {
    if (timer) clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onExternalAbort);
    // 消费方提前 break 时也要释放连接
    await reader?.cancel().catch(() => {});
  }
}
