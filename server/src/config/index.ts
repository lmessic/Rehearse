/**
 * 后端运行时配置集中在这里读取。
 *
 * 优先使用后端专用变量（MODEL_NAME、ARK_API_KEY、PORT、API_BASE_URL），
 * 未配置时回退到项目已有的 DeepSeek 环境变量或默认值。
 * 这样既可以复用本项目的 .env.local，也不会把密钥暴露到浏览器端。
 */
export const MODEL_NAME =
  process.env.MODEL_NAME ?? process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
export const ARK_API_KEY =
  process.env.ARK_API_KEY ?? process.env.DEEPSEEK_API_KEY;
export const PORT = process.env.PORT || 9527;
export const API_BASE_URL =
  process.env.API_BASE_URL ??
  process.env.DEEPSEEK_BASE_URL ??
  "https://api.deepseek.com";
