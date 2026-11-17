# Rehearse · 追问

> 用你的简历，练你的面试。
>
> 把简历丢进去，它从你的项目里挖出面试官一定会追问的点，逐题陪你练，
> 最后给一份能直接改进的复盘报告。

## 这个项目想解决什么

面试卡住的地方往往不是「不会」，而是**简历上写的那句话经不起追问**。
比如「主导了 RN 向 Taro 的整体迁移」——面试官问一句「灰度怎么切、出问题怎么回滚」，
如果答不出来，这句话就从加分变成了减分。

Rehearse 做的事：**从简历里反向找出这些最脆弱的点，逼你在面试前先答一遍。**

## 三处和「套壳 AI」的区别

| 差异                                     | 具体实现                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **流式渲染不闪、不吞字、可中断**         | 未闭合的代码块先降级渲染，闭合后升级高亮；中文跨 chunk 不乱码；随时可打断，服务端能感知并停止计费 |
| **状态机不是 loading / success / error** | 模型慢、模型不准、用户主动取消，三种情况走三条不同路径；降级是一个终态，不是错误态                |
| **把「慢」和「不准」分开度量**           | 同时记录 TTFT（首字时间）与总时长，以及每题判定与降级原因                                         |

## 技术栈

- **框架**：Next.js 16（App Router）
- **语言**：TypeScript
- **样式**：Tailwind CSS v4
- **状态**：Zustand
- **校验**：zod（运行时校验模型返回的结构化数据）
- **部署**：Vercel

> 说明：本项目有意**不使用现成的流式 SDK**，SSE 帧解析、合批与状态机均为手写，
> 目的是把每一个边界情况都变成可解释的实现。

## 目录结构

```
src/
├── app/
│   ├── layout.tsx            根布局
│   ├── page.tsx              首页
│   ├── parse/                简历解析页（可上传 PDF 或粘贴文本）
│   ├── session/[id]/         做题页（骨架）
│   ├── report/[id]/          复盘报告页（骨架）
│   └── api/
│       └── parse/route.ts    简历解析接口
├── components/
│   ├── NavBar.tsx
│   ├── Toast.tsx
│   └── parse/ParsePanel.tsx  解析交互面板
├── lib/
│   ├── env.ts                环境变量读取
│   ├── llm.ts                DeepSeek 客户端（JSON 模式 + 重试）
│   ├── pdf.ts                浏览器端 PDF 文本抽取
│   ├── prompts.ts            提示词
│   ├── schemas.ts            zod 契约与类型
│   └── constants.ts          前后端共享常量
├── store/
│   └── toastStore.ts
└── utils/                    手写练习：bind / call / apply / 深拷贝 / 环形缓存

scripts/
├── copy-pdfjs-assets.mjs     把 pdfjs 的 worker / cmaps / 字体复制到 public/pdfjs
└── check-secrets.mjs         提交前扫描明文密钥
```

### PDF 解析说明

PDF 全程在**浏览器内**解析，不上传到服务器：

- 使用 `pdfjs-dist`，通过动态 `import()` 按需加载，不影响首屏体积
- worker、`cmaps`、`standard_fonts` 由 `predev` / `prebuild` 自动复制到 `public/pdfjs/`
- `cmaps` 是必需的：中文 PDF 大量使用 CID 字体，缺了会导致乱码或抽取失败
- 扫描件（图片型 PDF）没有文字层，会提示先用 OCR 转文本

## 本地运行

前置：Node.js >= 20，以及一个 DeepSeek API Key

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（复制模板后填入你的 key）
#    Windows PowerShell: Copy-Item .env.example .env.local
cp .env.example .env.local

# 3. 启动开发服务器
npm run dev
```

打开 http://localhost:3000

### 环境变量

| 变量                | 必填 | 默认值                     | 说明                                 |
| ------------------- | ---- | -------------------------- | ------------------------------------ |
| `DEEPSEEK_API_KEY`  | ✅   | —                          | 模型密钥，**只在服务端使用**         |
| `DEEPSEEK_BASE_URL` |      | `https://api.deepseek.com` | OpenAI 兼容地址                      |
| `DEEPSEEK_MODEL`    |      | `deepseek-chat`            | 使用 `deepseek-chat`，不涉及推理模型 |
| `MAX_RESUME_CHARS`  |      | `8000`                     | 简历文本上限，超出会截断并标记       |

> 密钥没有 `NEXT_PUBLIC_` 前缀，因此不会被打进前端产物。
> 构建阶段不需要真实密钥，只有真正调用接口时才会校验。

### 密钥安全

**本地开发**：写在 `.env.local`（已被 `.gitignore` 的 `.env*` 规则忽略，从未进入过 git 历史）。

**生产环境**：用服务器上的环境变量，不要把 `.env.production` 打进镜像。

| 方式 | 说明 | 推荐度 |
| --- | --- | --- |
| 平台 Secrets / KMS | 云厂商凭据管理、部署平台的环境变量面板 | ⭐⭐⭐ |
| `docker compose` 的 `env_file` | 文件在服务器上、`chmod 600`、不进 git 不进镜像 | ⭐⭐ |
| 宿主机环境变量注入 | `environment: DEEPSEEK_API_KEY=${...}` | ⭐⭐ |
| 写进 `Dockerfile` 的 `ENV` | 会固化在镜像层，`docker history` 可见 | ❌ |
| 提交到 git | 删掉也在历史里 | ❌ |

**提交前自检**：

```bash
npm run check:secrets
```

扫描已跟踪文件里的密钥特征（DeepSeek / OpenAI、AWS、GitHub Token、硬编码赋值），命中会打码输出位置。

建议装成 pre-commit 钩子，在提交前拦一道：

```bash
cp scripts/check-secrets.mjs .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

> Windows 下钩子需要能被 Git Bash 执行；也可以直接放在 CI 里跑。

**泄露应急流程**（顺序不能反）：

1. 先到控制台**吊销**旧密钥
2. 生成新密钥
3. 更新服务器环境变量并重启
4. 查账单有无异常消耗

**额外建议**：在 DeepSeek 控制台设置**花费上限**——即使密钥泄露，损失也有上限，这比任何代码层面的防护都直接。

```bash
# 生产构建
npm run build

# 代码检查
npm run lint
```

## 开发进度

| 阶段 | 内容                                 | 状态   |
| ---- | ------------------------------------ | ------ |
| W1   | 骨架上线 + 简历解析（含 PDF 上传）   | ✅ 完成 |
| W2   | 流式作答（手写 SSE 解析 + rAF 合批） | ✅ 完成 |
| W3   | 状态机 + 中断 + 降级                 | 待开始 |
| W4   | 复盘报告 + 示例体验 + 演示录屏       | 待开始 |

## 本地验证流式（不消耗模型额度）

流式链路的正确性可以在**不调用真实模型**的前提下验证——用一个模拟上游：

```bash
# 1. 起一个假的上游（会故意把中文从字节中间切开发送）
npm run mock:upstream
# 监听 http://127.0.0.1:8899

# 2. 让应用指向它（新开一个终端）
DEEPSEEK_BASE_URL=http://127.0.0.1:8899 DEEPSEEK_API_KEY=sk-mock npm run dev
```

打开 `/session/demo` 作答，就能看到流式输出。这个 mock 会：
- 先发一个只有 `role` 的空帧（真实上游就是这样）
- **把一个汉字从字节中间切开分两次发送**——验证 `TextDecoder` 的流式解码
- 每帧间隔 70ms，便于观察增量渲染

### 不打断 dev server 做生产验证

构建输出目录可以用环境变量指定，这样生产构建不会和正在运行的 dev server 抢 `.next`：

```bash
NEXT_DIST_DIR=.nextverify npm run build
NEXT_DIST_DIR=.nextverify npx next start -p 3417
```

## 关键设计说明

### 为什么自己解析 SSE 帧

`EventSource` 只支持 GET、不能带自定义 header，而且无法让服务端感知「用户主动中断」。
所以客户端用 `fetch` + `ReadableStream` 自行解析，配合 `TextDecoder({ stream: true })`
处理跨 chunk 的多字节字符，避免中文乱码。

### 为什么需要合批

SSE 每收到一段数据是一次独立的宏任务，React 的自动批处理作用域是单次微任务刷新，
跨宏任务无法合并。因此需要把增量累积后在 `requestAnimationFrame` 中一帧提交一次。

### 为什么降级是终态而不是错误态

低置信度时用户仍应看到 AI 给出的建议，只是同时展开传统入口。
若把降级做成 `error`，就没有地方挂载这份结果，而且降级率与错误率是两个不同的指标。

## License

MIT
