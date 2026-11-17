import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { chatJson, LlmError } from "@/lib/llm";
import { ParseResultSchema, type ApiErrorBody } from "@/lib/schemas";
import { buildParseUserPrompt, PARSE_SYSTEM_PROMPT } from "@/lib/prompts";

/**
 * POST /api/parse
 *
 * 请求：{ text: string }      // 前端用 pdfjs 抽好的纯文本
 * 响应：{ points, truncated }
 *
 * 失败语义（前端按 code 决定提示文案）：
 *   400 BAD_REQUEST      —— 请求体不合法或文本过短
 *   500 CONFIG_MISSING   —— 服务端没配 DEEPSEEK_API_KEY
 *   504 UPSTREAM_TIMEOUT —— 模型超时
 *   502 UPSTREAM_ERROR   —— 模型报错 / 输出不合法
 */

const RequestSchema = z.object({
  // 太短的文本（< 80 字）解析不出东西，直接拦掉省一次调用
  text: z.string().min(80, "简历内容太短，无法解析"),
});

function fail(status: number, code: ApiErrorBody["error"]["code"], message: string) {
  return NextResponse.json<ApiErrorBody>({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "BAD_REQUEST", "请求体不是合法 JSON");
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return fail(400, "BAD_REQUEST", first?.message ?? "请求参数不合法");
  }

  const maxChars = env.maxResumeChars;
  const original = parsed.data.text;
  const truncated = original.length > maxChars;
  const resumeText = truncated ? original.slice(0, maxChars) : original;

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
        return fail(500, "CONFIG_MISSING", "服务端未配置模型密钥，请联系管理员");
      case "UPSTREAM_TIMEOUT":
        return fail(504, "UPSTREAM_TIMEOUT", "模型响应超时，请稍后重试");
      case "INVALID_JSON":
        return fail(502, "INVALID_JSON", "模型输出格式异常，请重试");
      default:
        return fail(502, "UPSTREAM_ERROR", "模型服务暂时不可用，请稍后重试");
    }
  }
}
