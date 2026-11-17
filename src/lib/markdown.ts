/**
 * 流式 Markdown 的分块策略（客户端）。
 *
 * 核心问题：AI 回复是一段段到达的，如果每一帧都把全文重新 parse 一遍，
 * 文本到几千字时一次解析就要几毫秒，叠加高亮会直接吃掉 16ms 的帧预算，
 * 视觉上表现为闪烁、跳行。
 *
 * 策略：
 *   - 按「空行」切块，且不切在代码围栏内部；
 *   - 已闭合的块内容不再变化，可以按内容做缓存，只解析一次；
 *   - 只有最后一块（还在增长）需要每帧重解析，成本与「块长度」成正比，
 *     而不是与「全文长度」成正比。
 *
 * 另外，最后一块如果还在代码围栏里，就不按 Markdown 渲染，
 * 而是当纯文本显示——避免围栏闭合前后结构跳变。
 */

/** 判断一行是否是围栏起止标记 */
const FENCE = /^\s*(```|~~~)/;

/**
 * 把 Markdown 按顶层空行切块。
 * 围栏内部的空行不切，否则代码块会被拆散。
 */
export function splitBlocks(markdown: string): string[] {
  if (!markdown.trim()) return [];

  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (FENCE.test(line)) inFence = !inFence;

    if (!inFence && line.trim() === "") {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

/** 这一块是否停在未闭合的代码围栏里 */
export function hasOpenFence(block: string): boolean {
  let count = 0;
  for (const line of block.split("\n")) {
    if (FENCE.test(line)) count++;
  }
  return count % 2 === 1;
}

/**
 * 未闭合围栏的临时补全。
 * 只在需要「先按 Markdown 渲染一段还在增长的内容」时使用。
 */
export function balanceFence(block: string): string {
  return hasOpenFence(block) ? `${block}\n\`\`\`` : block;
}
