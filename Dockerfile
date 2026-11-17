# ---------- 1. 依赖层 ----------
FROM node:22-alpine AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

# ---------- 2. 构建层 ----------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 开启 standalone 输出，供运行层使用
ENV BUILD_STANDALONE=1
# 构建期不调用模型，给占位值即可（代码在调用时才会校验）
ENV DEEPSEEK_API_KEY=sk-build-placeholder

RUN npm run build

# ---------- 3. 运行层 ----------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# 容器默认 UTC，不改的话日志时间会差 8 小时，排查问题很痛苦
ENV TZ=Asia/Shanghai

RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nextjs -G nodejs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# standalone 产物自带 server.js，不要用 next start
CMD ["node", "server.js"]
