/**
 * 浏览器端 PDF 文本抽取。
 *
 * 设计取舍：PDF 不上传到服务端，直接在浏览器解析。
 *   - 省一次上传（简历 1–5MB，弱网下很明显）
 *   - 服务端不需要处理文件临时存储与清理
 *   - 代价是首次解析要下载 pdfjs（约 500KB），用动态 import 让它按需加载
 *
 * 清理方式：pdfjs 6 的类型里 PDFDocumentProxy 没有 destroy，
 * 正确入口是 PDFDocumentLoadingTask.destroy()，它会连同 worker 一起释放。
 *
 * 注意：这是纯客户端模块，只能在 "use client" 组件里调用。
 */

export type PdfErrorCode =
  | "NOT_PDF"
  | "TOO_LARGE"
  | "PARSE_FAILED"
  | "PASSWORD_PROTECTED"
  | "NO_TEXT";

export class PdfError extends Error {
  constructor(
    readonly code: PdfErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PdfError";
  }
}

/** 10MB，足够放下任何简历，也能防止误传大文件把标签页卡死 */
export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export interface PdfTextResult {
  text: string;
  pageCount: number;
  /** 完全没有文字的页数，用于提示「像是扫描件」 */
  emptyPageCount: number;
}

/** pdfjs 的 TextItem 只用到这两个字段 */
interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

/**
 * 从一个 PDF 文件里抽出纯文本。
 *
 * 失败一律抛 PdfError，调用方按 code 给提示，不需要关心 pdfjs 的异常类型。
 */
export async function extractPdfText(file: File): Promise<PdfTextResult> {
  // ---- 1. 前置校验 ----
  const looksLikePdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!looksLikePdf) {
    throw new PdfError("NOT_PDF", "只支持 PDF 文件");
  }

  if (file.size > MAX_PDF_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new PdfError(
      "TOO_LARGE",
      `文件 ${mb}MB，超过 10MB 上限。可以只导出简历相关页再试`,
    );
  }

  // ---- 2. 按需加载 pdfjs ----
  // 动态 import：只有真的上传 PDF 时才下载这个包，不影响首屏
  const pdfjs = await import("pdfjs-dist");

  // worker、cmaps、standard_fonts 由 scripts/copy-pdfjs-assets.mjs 放到 public/pdfjs
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());

  const loadingTask = pdfjs.getDocument({
    data,
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    // 只抽文本，不需要渲染，跳过字体图标的加载
    disableFontFace: true,
  });

  try {
    // ---- 3. 打开文档 ----
    let doc;
    try {
      doc = await loadingTask.promise;
    } catch (error) {
      const name = (error as Error)?.name ?? "";
      if (name === "PasswordException") {
        throw new PdfError(
          "PASSWORD_PROTECTED",
          "PDF 有密码保护，请先解除加密再上传",
        );
      }
      throw new PdfError(
        "PARSE_FAILED",
        `PDF 打开失败：${(error as Error)?.message ?? "未知错误"}`,
      );
    }

    // ---- 4. 逐页抽文本 ----
    const pages: string[] = [];
    let emptyPageCount = 0;

    for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();

      let pageText = "";
      for (const raw of content.items as PdfTextItem[]) {
        if (typeof raw.str !== "string") continue;
        pageText += raw.str;
        // hasEOL 表示这一项是行尾，补换行才能保住段落结构
        if (raw.hasEOL) pageText += "\n";
      }

      const trimmed = pageText.trim();
      if (trimmed.length === 0) {
        emptyPageCount++;
      } else {
        pages.push(trimmed);
      }

      // 及时释放页面资源，大文件时差别明显
      page.cleanup();
    }

    const text = normalize(pages.join("\n\n"));

    if (text.length === 0) {
      throw new PdfError(
        "NO_TEXT",
        "这份 PDF 里没有可提取的文字，可能是扫描件或图片型 PDF。可以先用 OCR 转成文本再粘贴",
      );
    }

    return { text, pageCount: doc.numPages, emptyPageCount };
  } finally {
    // 无论成功失败都要销毁：loadingTask.destroy() 会一并释放 document 与 worker
    await loadingTask.destroy().catch(() => {});
  }
}

/** 收敛空行、去掉多余空白，让结果更适合直接送给模型 */
function normalize(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
