import { NextResponse } from "next/server";

/**
 * POST /api/parse
 *
 * 请求：{ text: string }            // 前端用 pdfjs 抽好的纯文本
 * 响应：{ points: ResumePoint[] }
 *
 * W1 待实现：
 *   1. 校验输入长度（超过 8000 字截断并标记 parse_truncated）
 *   2. 调用模型，要求严格 JSON 输出
 *   3. 用 zod 校验，失败重试一次，再失败返回 INVALID_JSON
 */
export async function POST() {
  return NextResponse.json(
    {
      error: {
        code: "NOT_IMPLEMENTED",
        message: "简历解析尚未实现（W1 任务）",
      },
    },
    { status: 501 },
  );
}
