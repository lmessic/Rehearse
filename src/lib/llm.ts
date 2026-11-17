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
export async function chatJson<T>(
  opts: ChatJsonOptions<T>,
): Promise<T> {
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
