import type { NextFunction, Request, Response } from "express";

/**
 * POST /api/chat 的请求体校验中间件。
 *
 * 页面每次发送最近的对话消息，服务端只允许 user / assistant 角色。
 * 校验失败时直接返回 HTTP 400，不再继续调用上游模型。
 * 校验通过时调用 next()，把请求交给聊天路由继续处理。
 */
export const validateChatRequest = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const messages = req.body?.messages;

  if (!Array.isArray(messages) || messages.length < 1 || messages.length > 20) {
    return res
      .status(400)
      .json({ error: "messages 必须包含 1 到 20 条对话消息" });
  }

  const validMessages = messages.every(
    (message) =>
      message !== null &&
      typeof message === "object" &&
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim().length > 0 &&
      message.content.length <= 4000,
  );

  if (!validMessages) {
    return res.status(400).json({
      error: "每条消息必须包含合法的 role 和 1 到 4000 个字符的 content",
    });
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
