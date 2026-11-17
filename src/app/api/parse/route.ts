import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { chatJson, LlmError } from "@/lib/llm";
import {
  MIN_RESUME_CHARS,
  ParseResultSchema,
  type ApiErrorBody,
} from "@/lib/schemas";
import { buildParseUserPrompt, PARSE_SYSTEM_PROMPT } from "@/lib/prompts";

/**
 * POST /api/parse
 *
 * 请求：{ text: string }      // 前端用 pdfjs 抽好的纯文本
 * 响应：{ points, truncated }
 *
 * 失败语义（前端按 code 决定提示文案）：
 *   400 BAD_REQUEST      —— 请求体不是 JSON，或 text 缺失/过短
 *   500 CONFIG_MISSING   —— 服务端没配 DEEPSEEK_API_KEY
 *   500 CONFIG_INVALID   —— 密钥无效（401/403）
 *   504 UPSTREAM_TIMEOUT —— 模型超时
 *   502 UPSTREAM_ERROR   —— 模型报错 / 输出不合法
 */

const RequestSchema = z.object({
  text: z.string(),
});

function fail(
  status: number,
  code: ApiErrorBody["error"]["code"],
  message: string,
) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  // ---- 1. 请求体解析 ----
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const contentType = request.headers.get("content-type") ?? "(未设置)";
    console.warn(`[parse] bad-request reason=json-parse content-type=${contentType}`);
    return fail(
      400,
      "BAD_REQUEST",
      '请求体不是合法 JSON。请用 Content-Type: application/json 发送 {"text": "简历全文"}',
    );
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    console.warn(`[parse] bad-request reason=missing-text`);
    return fail(
      400,
      "BAD_REQUEST",
      '缺少 text 字段。请求体应为 {"text": "简历全文"}',
    );
  }

  // ---- 2. 长度校验（提示里带上实际长度，便于排查） ----
  const raw = parsed.data.text;
  const trimmedLength = raw.trim().length;
  if (trimmedLength < MIN_RESUME_CHARS) {
    console.warn(
      `[parse] bad-request reason=too-short len=${trimmedLength} min=${MIN_RESUME_CHARS}`,
    );
    return fail(
      400,
      "BAD_REQUEST",
      `简历内容太短：当前 ${trimmedLength} 个字符，至少需要 ${MIN_RESUME_CHARS} 个`,
    );
  }

  // ---- 3. 截断 ----
  const maxChars = env.maxResumeChars;
  const truncated = raw.length > maxChars;
  const resumeText = truncated ? raw.slice(0, maxChars) : raw;

  // ---- 4. 调用模型 ----
  try {
    const result = await chatJson({
      system: PARSE_SYSTEM_PROMPT,
      user: buildParseUserPrompt(resumeText),
      schema: ParseResultSchema,
      maxTokens: 1200,
      timeoutMs: 30_000,
    });

    // 只记录结构化的耗时与规模，不记录简历内容
    console.info(
      `[parse] chars=${resumeText.length} truncated=${truncated} points=${result.points.length} ms=${Date.now() - startedAt} ok`,
    );

    return NextResponse.json({
      points: result.points,
      truncated,
    });
  } catch (error) {
    const llmError =
      error instanceof LlmError
        ? error
        : new LlmError("UPSTREAM_ERROR", String(error));

    console.error(
      `[parse] chars=${resumeText.length} ms=${Date.now() - startedAt} code=${llmError.code} msg=${llmError.message}`,
    );

    switch (llmError.code) {
      case "CONFIG_MISSING":
        return fail(500, "CONFIG_MISSING", "服务端未配置模型密钥，请在 .env.local 填写 DEEPSEEK_API_KEY");
      case "CONFIG_INVALID":
        return fail(
          500,
          "CONFIG_INVALID",
          "模型密钥无效：请确认 DEEPSEEK_API_KEY 是 DeepSeek 平台的 sk- 开头密钥",
        );
      case "UPSTREAM_TIMEOUT":
        return fail(504, "UPSTREAM_TIMEOUT", "模型响应超时，请稍后重试");
      case "INVALID_JSON":
        return fail(502, "INVALID_JSON", "模型输出格式异常，请重试");
      default:
        return fail(502, "UPSTREAM_ERROR", "模型服务暂时不可用，请稍后重试");
    }
  }
}
