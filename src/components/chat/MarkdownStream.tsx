"use client";

import { useMemo, useRef } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { hasOpenFence, splitBlocks } from "@/lib/markdown";

marked.setOptions({ gfm: true, breaks: true });

/** 缓存上限，防止极长会话把内存吃满 */
const CACHE_LIMIT = 300;

/**
 * 流式 Markdown 渲染。
 *
 * 性能约定：
 *   - 已闭合的块按「内容本身」做缓存，只解析一次；
 *   - 只有最后一块（还在增长）每帧重解析，成本与块长成正比；
 *   - 最后一块如果还在代码围栏里，按纯文本降级显示，
 *     避免围栏闭合前后结构跳变（这是「不闪」的关键）。
 */
export default function MarkdownStream({
  text,
  streaming = false,
}: {
  text: string;
  streaming?: boolean;
}) {
  const cache = useRef(new Map<string, string>());

  const blocks = useMemo(() => splitBlocks(text), [text]);

  function renderBlock(block: string): string {
    const cached = cache.current.get(block);
    if (cached !== undefined) return cached;

    const html = marked.parse(block, { async: false });
    // 服务端渲染阶段没有 window，DOMPurify 不可用；
    // 但此时 text 为空、不会走到这里，这里只是防御。
    const safe =
      typeof window === "undefined" ? html : DOMPurify.sanitize(html);

    if (cache.current.size > CACHE_LIMIT) cache.current.clear();
    cache.current.set(block, safe);
    return safe;
  }

  if (blocks.length === 0) {
    return streaming ? <span className="stream-cursor text-slate-400" /> : null;
  }

  return (
    <div className="md-body">
      {blocks.map((block, index) => {
        const isTail = index === blocks.length - 1;

        // 未闭合代码块：降级为等宽纯文本，不做 Markdown 解析
        if (isTail && hasOpenFence(block)) {
          return (
            <pre key={index} className="md-pending">
              {block}
            </pre>
          );
        }

        return (
          <div
            key={index}
            className={isTail && streaming ? "stream-cursor" : undefined}
            dangerouslySetInnerHTML={{ __html: renderBlock(block) }}
          />
        );
      })}
    </div>
  );
}
