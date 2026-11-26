import express, { Request, Response, NextFunction } from "express";
import { validateChatRequest } from "../middleware";
import { API_BASE_URL, ARK_API_KEY, MODEL_NAME, PORT } from "../config";

// 创建 Express 应用实例。它负责接收浏览器请求、调用模型并返回流式响应。
const app = express();

// 将请求体中的 application/json 数据解析到 req.body。
app.use(express.json());

// 跨域中间件：
// Next.js 页面运行在 localhost:3000，Express 运行在 localhost:9527，
// 浏览器因此会跨端口访问。这里允许页面读取响应和发送预检请求。
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:3000");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

/**
 * 往 SSE 连接里写一帧。
 *
 * 连接可能在写之前就断了（用户关页面、切网络），此时 write 会返回 false
 * 甚至抛错。统一走这里，避免在已关闭的响应上继续写。
 */
const writeFrame = (res: Response, payload: unknown) => {
  if (res.writableEnded || res.destroyed) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

/**
 * 聊天接口的完整处理流程：
 * 1. 接收前端最近的对话消息；
 * 2. 设置 SSE 响应头并立即发出首帧；
 * 3. 使用服务端密钥调用 OpenAI/DeepSeek兼容接口；
 * 4. 将上游流逐段解析并转成前端统一的数据帧；
 * 5. 遇到错误时通过 SSE 返回 error 帧；
 * 6. 客户端断开时中止上游请求，避免继续消耗 token。
 */
app.post("/api/chat", validateChatRequest, async (req, res) => {
  // 每个请求一个 AbortController，用来把「客户端断开」传导到上游 fetch。
  const controller = new AbortController();

  /**
   * 客户端断开检测。
   *
   * res 的 "close" 在连接结束时一定会触发——包括正常结束。
   * 所以要看 writableEnded：它为 false 说明我们还没调用 res.end()，
   * 那就是客户端提前走了（关页面、点停止、断网）。
   */
  res.on("close", () => {
    if (!res.writableEnded) {
      console.info("[chat] 客户端断开，中止上游请求");
      controller.abort();
    }
  });

  try {
    const { messages } = req.body;

    // 设置 SSE 必需响应头。
    // text/event-stream 表明浏览器应持续读取响应；no-cache 和 keep-alive
    // 用于关闭缓存并保持长连接，flushHeaders() 会立即发出响应头。
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // meta 帧先通知前端本次请求已经建立。
    // 每条请求都有独立 ID，便于后续日志和排查问题。
    writeFrame(res, {
      t: "meta",
      id: `chat_${Date.now().toString(36)}`,
    });

    // 由后端持有密钥并调用模型厂商，浏览器不会看到 API 密钥。
    // /chat/completions 是 DeepSeek 等兼容服务的 OpenAI 风格接口。
    const response = await fetch(`${API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARK_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages,
        stream: true,
      }),
      // 关键：把客户端断开传导给上游，断开后模型侧也停止生成
      signal: controller.signal,
    });

    // 非 2xx 响应通常表示地址、密钥、模型或额度参数存在问题，
    // 抛出异常后由下面的 catch 统一转换为前端可识别的 SSE error 帧。
    if (!response.ok) {
      throw new Error(`HTTP error status: ${response.status}`);
    }

    // response.body 是模型返回的 ReadableStream。
    // 逐 chunk 读取并持续写入浏览器，不等待模型完整生成后再一次性返回。
    await handlesseResponse(res, response.body);
    if (!res.writableEnded) res.end();
  } catch (error: unknown) {
    // 被 abort 掉不算错误：客户端已经走了，没有对象可以报错
    if (controller.signal.aborted) {
      console.info("[chat] 已中止，停止写入");
      return;
    }

    console.error("调用API时出错", error);
    const message = error instanceof Error ? error.message : "抱歉发生了错误";
    writeFrame(res, { t: "error", code: "UPSTREAM_ERROR", message });
    if (!res.writableEnded) res.end();
  }
});

/**
 * 将上游模型的 SSE 流转换成前端项目统一的数据帧。
 *
 * 上游格式：
 * data: {"choices":[{"delta":{"content":"部分文本"}}]}
 *
 * 前端格式：
 * data: {"t":"delta","v":"部分文本"}
 *
 * 由于网络 chunk 可以在任意字节处断开，此函数同时处理：
 * - 不完整的换行和 SSE 帧；
 * - UTF-8 字符跨 chunk 截断；
 * - 上游结束标记 [DONE]；
 * - 单个异常帧，不影响后续帧读取。
 */
const handlesseResponse = async (
  res: Response,
  stream: ReadableStream<Uint8Array<ArrayBuffer>> | null,
) => {
  // 没有响应体时不再启动读取循环。
  if (!stream) {
    throw new Error("响应流为空");
  }

  // getReader() 把流变成可逐次读取的接口；
  // TextDecoder({ stream: true }) 会保留跨 chunk 的不完整 UTF-8 字节。
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  // 缓存
  let buffer = "";

  try {
    while (true) {
      // 连接已经断了就不必再拉上游数据（abort 会同时中止 fetch）
      if (res.destroyed) break;

      // 每次读到的 value 可能只包含半行或半个中文字符。
      const { done, value } = await reader.read();
      if (done) break;

      // 将本次字节解码后追加到缓存，而不是直接按当前 chunk 解析，
      // 这样前一 chunk 的末尾和本 chunk 的开头仍可以拼成完整内容。
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // 最后一项可能是不完整行，保留到下一次读取后继续拼接；
      // 已完整的行交给下面的循环处理。
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        // SSE 规范中的 data: 行才携带业务数据，忽略空行和其他字段。
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();

        // OpenAI兼容上游使用 [DONE] 表示流式输出结束。
        if (data === "[DONE]") {
          writeFrame(res, { t: "done" });
          continue;
        }

        // 上游返回可能包含 role、usage、空 content 等无关字段。
        // 我们只读取第一个 choices 项中的增量文本。
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices[0]?.delta?.content;

          if (typeof content === "string") {
            writeFrame(res, { t: "delta", v: content });
          }
        } catch (e) {
          // 坏帧只记录日志，不中断整个模型流。
          console.error("解析响应失败:", e);
        }
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "未知流处理错误";
    throw new Error(`流处理错误: ${message}`);
  } finally {
    // 不论正常结束还是发生异常，都释放流读取锁；
    // 流被中止时 releaseLock 可能抛错，所以包一层。
    try {
      reader.releaseLock();
    } catch {
      // 已释放或流已关闭，忽略
    }
  }
};

/**
 * 健康检查接口，用于确认服务进程是否启动以及 HTTP 服务是否可响应。
 * 不调用模型，因此不会消耗 token。
 */
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Express 最后兜底的错误处理中间件。
 * 聊天路由内部通常已捕获并写入 SSE error 帧，这里主要处理
 * 未被前面的路由逻辑捕获的服务器异常。
 */
app.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  void _next;
  console.error("服务器错误:", _err);
  res.status(500).json({ error: "服务器内部错误" });
});

// 启动服务
app.listen(PORT, () => {
  console.log(`服务运行在 http://localhost:${PORT}`);
});
