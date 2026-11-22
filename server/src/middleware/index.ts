import type { NextFunction, Request, Response } from "express";

/**
 * POST /api/chat 的请求体校验中间件。
 *
 * 页面每次发送消息时，会把用户文本放在 body.query 中。
 * 校验失败时直接返回 HTTP 400，不再继续调用上游模型。
 * 校验通过时调用 next()，把请求交给聊天路由继续处理。
 */
export const validateChatRequest = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { query } = req.body;

  if (typeof query !== "string" || !query.trim()) {
    return res.status(400).json({ error: "查询内容不能为空" });
  }

  next();
};

/**
 * 将文本中的 SSE 特殊字符转义，避免用户或模型内容破坏 SSE 帧格式。
 *
 * 该函数保留在中间件模块中供服务端数据转换使用；
 * 注意实际 JSON 内容应优先通过 JSON.stringify 整体编码。
 */
export const escapeSse = (text: string) => {
  return text.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/"/g, '\\"');
};
