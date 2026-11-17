import { z } from "zod";

/**
 * 简历解析的结构化输出契约。
 *
 * 为什么每个字段都限长：模型偶尔会把整段简历塞进 evidence，
 * 加上限长可以让脏数据在 schema 层就被拒绝，而不是流到 UI。
 */

export const RiskLevelSchema = z.enum(["high", "mid", "low"]);

export const ResumePointSchema = z.object({
  /** 项目点标题，如「AI 智能申请售后」 */
  title: z.string().min(2).max(40),
  /** 简历原文摘录，用于候选人核对，防止模型编造 */
  evidence: z.string().min(2).max(200),
  /** 为什么面试官会追问它 */
  whyAsked: z.string().min(2).max(200),
  /** 被追问的风险等级 */
  risk: RiskLevelSchema,
});

export const ParseResultSchema = z.object({
  points: z.array(ResumePointSchema).min(1).max(5),
});

export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export type ResumePoint = z.infer<typeof ResumePointSchema>;
export type ParseResult = z.infer<typeof ParseResultSchema>;

/** 接口统一的错误体，前端按 code 决定提示文案 */
export type ApiErrorCode =
  | "BAD_REQUEST"
  | "CONFIG_MISSING"
  | "UPSTREAM_TIMEOUT"
  | "UPSTREAM_ERROR"
  | "INVALID_JSON";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}
