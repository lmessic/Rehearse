/**
 * 环境变量读取。
 *
 * 注意：这里用 getter 而不是在模块顶层直接校验，
 * 因为 `next build` 阶段通常没有真实密钥，顶层抛错会让构建失败。
 * 真正缺少密钥时，应该在第一次调用模型时报错并返回友好提示。
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new MissingEnvError(name);
  }
  return value;
}

export class MissingEnvError extends Error {
  constructor(readonly variable: string) {
    super(`缺少环境变量 ${variable}，请复制 .env.example 为 .env.local 并填写`);
    this.name = "MissingEnvError";
  }
}

export const env = {
  get deepseekApiKey(): string {
    return required("DEEPSEEK_API_KEY");
  },
  get deepseekBaseUrl(): string {
    return process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com";
  },
  get deepseekModel(): string {
    return process.env.DEEPSEEK_MODEL ?? "deepseek-chat";
  },
  get maxResumeChars(): number {
    const n = Number(process.env.MAX_RESUME_CHARS);
    return Number.isFinite(n) && n > 0 ? n : 8000;
  },
};
