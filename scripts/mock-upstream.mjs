/**
 * 模拟 DeepSeek 的流式上游，用于端到端验证。
 *
 * 故意做两件"坏"事：
 *   1. 把一个汉字从中间切开分两次写（检验 TextDecoder 的流式解码）；
 *   2. 分多帧、带延迟地吐内容（检验增量渲染与首字时间）。
 *
 * 用法：node scripts/_mock-upstream.mjs [port]
 */
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 8899);

/** 要吐出的完整内容（Markdown，含中文、加粗、代码围栏、列表） */
const PIECES = [
  "先说结论：你把**链路**讲清楚了，但取舍讲得偏少。\n\n",
  "追问一：SSE 断线之后，用户看到什么？你怎么区分\"可重试\"和\"该降级\"？\n\n",
  "```ts\n",
  "const retryable = status >= 500;\n",
  "```\n\n",
  "- 别只说\"加重试\"\n- 讲清楚重试上限与降级触发条件\n",
];

function frameFor(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

const server = createServer((req, res) => {
  if (req.method !== "POST" || !req.url?.includes("/chat/completions")) {
    res.writeHead(404).end("not found");
    return;
  }

  // 吃掉请求体，避免连接挂起
  req.resume();
  req.on("end", async () => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // 首帧只有 role，没有内容 —— 真实上游就是这样
    res.write(
      `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n\n`,
    );

    for (const piece of PIECES) {
      const line = frameFor(piece);
      const buf = Buffer.from(line, "utf8");

      // 关键：第一个含中文的帧，从字节中间切开分两次发送
      if (piece === PIECES[0]) {
        const half = Math.floor(buf.length / 2);
        res.write(buf.subarray(0, half));
        await sleep(30);
        res.write(buf.subarray(half));
      } else {
        res.write(buf);
      }

      await sleep(70);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock upstream listening on http://127.0.0.1:${PORT}`);
});
