/**
 * 前后端共享的常量。
 *
 * 单独放一个文件，是为了让客户端组件也能引用，
 * 而不会因为 `import` 把 zod 之类的服务端依赖打进前端 bundle。
 */

/** 简历正文的最小长度：低于这个值抽不出有意义的项目点 */
export const MIN_RESUME_CHARS = 80;

/** 简历正文的默认上限（可被 MAX_RESUME_CHARS 覆盖） */
export const DEFAULT_MAX_RESUME_CHARS = 8000;
