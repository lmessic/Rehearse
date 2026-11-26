import { createSseParser } from "./sse";
import type { StreamFrame } from "./stream-protocol";

// 状态
export enum SSEState {
  IDLE = "idle",
  CONNECTING = "connecting",
  OPEN = "open",
  RETRYING = "retrying",
  CLOSED = "closed",
  FAILED = "failed",
}

interface ReconnectOptions {
  // 最大重连次数
  maxRetries: number;
  // 基础延迟 ms
  baseDelayMs: number;
  // 最大延迟
  maxDelayMs: number;
}

export interface SSEClientOptions {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  reconnect?: false | ReconnectOptions;
  signal?: AbortSignal;
  onStateChange?: (state: SSEState) => void;
  onFrame?: (frame: StreamFrame) => void;
  onRetry?: (attempt: number, delayMs: number, error: Error) => void;
  onError?: (error: Error) => void;
}

class SSEHttpError extends Error {
  constructor(
    readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP error status: ${status}`);
    this.name = "SSEHttpError";
  }
}

const DEFAULT_RECONNECT_OPTIONS: ReconnectOptions = {
  maxRetries: 2,
  baseDelayMs: 500,
  maxDelayMs: 5000,
};

// sse协议层客户端
export class SSEClient {
  // 当前连接生命周期状态。
  private state: SSEState = SSEState.IDLE;
  // 重连时用于 Last-Event-ID 的事件标识；当前解析器尚未更新此值。
  private lastEventId: string | null = null;
  // 用于中止当前 fetch 请求。
  private controller: AbortController | null = null;
  // 当前响应流的读取器，关闭客户端时用于停止读取。
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  // 已经执行的重连次数。
  private retriesUsed = 0;
  // 是否已收到终止帧（done 或 error）。
  private terminal = false;
  // 已经向调用方发送增量文本后，重试会造成内容重复，因此不再自动重试。
  private emittedDelta = false;

  constructor(private options: SSEClientOptions) {}

  // 开始连接和消费流程
  async connect(): Promise<void> {
    // 同一个客户端已经在连接、接收数据或等待重试时，不再并发创建第二条连接。
    if (
      this.state === SSEState.CONNECTING ||
      this.state === SSEState.OPEN ||
      this.state === SSEState.RETRYING
    ) {
      return;
    }

    // 每次启动都创建独立的取消控制器，并重置本轮流的结束标记和重试计数。
    const controller = new AbortController();
    this.controller = controller;
    this.terminal = false;
    this.emittedDelta = false;
    this.retriesUsed = 0;

    // 将调用方传入的 signal 转发给本地控制器，使 fetch 使用统一的取消信号。
    const externalSignal = this.options.signal;
    const abortFromExternalSignal = () => controller.abort();

    try {
      // signal 可能在 connect() 前就已取消；否则监听后续取消事件。
      if (externalSignal?.aborted) {
        controller.abort();
      } else {
        externalSignal?.addEventListener("abort", abortFromExternalSignal, {
          once: true,
        });
      }

      // 请求开始前再次检查取消状态，避免已取消的调用仍发起网络请求。
      if (controller.signal.aborted) {
        this.setState(SSEState.CLOSED);
        return;
      }

      // 标记正在建立连接，并声明客户端期望接收 SSE 响应。
      this.setState(SSEState.CONNECTING);
      await this.run();

      // 流正常结束后标记连接关闭。
      this.setState(SSEState.CLOSED);
    } catch (error) {
      // 主动取消不是连接故障，不调用 onError，也不向调用方抛出错误。
      if (controller.signal.aborted) {
        this.setState(SSEState.CLOSED);
        return;
      }

      // 统一错误类型，更新状态并通知调用方；继续抛出以便调用方也能 await/catch。
      const normalizedError =
        error instanceof Error ? error : new Error(String(error));
      this.setState(SSEState.FAILED);
      this.options.onError?.(normalizedError);
      throw normalizedError;
    } finally {
      // 无论成功、失败还是取消，都移除外部监听，并只清除本轮使用的控制器。
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
      if (this.controller === controller) {
        this.controller = null;
      }
    }
  }
  getState(): SSEState {
    return this.state;
  }
  // 更新状态
  private setState(state: SSEState): void {
    if (this.state === state) return;

    this.state = state;
    this.options.onStateChange?.(state);
  }

  private async run(): Promise<void> {
    // 每次尝试共用 connect() 创建的控制器，这样关闭客户端会同时中止请求和退避等待。
    const controller = this.controller;
    if (!controller) {
      throw new Error("SSE 客户端尚未初始化");
    }

    // reconnect=false 表示完全关闭重试；未配置时采用默认策略。
    const reconnectOptions =
      this.options.reconnect === false
        ? null
        : (this.options.reconnect ?? DEFAULT_RECONNECT_OPTIONS);
    // 对用户配置做边界归一化，避免负数、NaN 等配置产生负延迟或无限重试。
    const maxRetries =
      reconnectOptions && Number.isFinite(reconnectOptions.maxRetries)
        ? Math.max(0, Math.floor(reconnectOptions.maxRetries))
        : 0;
    const baseDelayMs =
      reconnectOptions && Number.isFinite(reconnectOptions.baseDelayMs)
        ? Math.max(0, reconnectOptions.baseDelayMs)
        : 0;
    const maxDelayMs =
      reconnectOptions && Number.isFinite(reconnectOptions.maxDelayMs)
        ? Math.max(0, reconnectOptions.maxDelayMs)
        : 0;

    // 每轮循环都是一次全新的 HTTP 请求；取消后立即退出，不再发起下一次请求。
    while (!controller.signal.aborted) {
      try {
        // 每次尝试重新构造请求头，并携带当前可用的事件 ID（若服务端支持回放）。
        const headers: Record<string, string> = {
          Accept: "text/event-stream",
          ...this.options.headers,
        };

        // 若已有事件 ID，则告知服务端从该事件之后继续；服务端需支持回放才能生效。
        if (this.lastEventId) {
          headers["Last-Event-ID"] = this.lastEventId;
        }

        const response = await fetch(this.options.url, {
          method: this.options.method ?? "GET",
          headers,
          body: this.options.body,
          signal: controller.signal,
        });

        // 非 2xx 响应不是 SSE 流；先释放响应体，再保留状态码供重试策略判断。
        if (!response.ok) {
          const status = response.status;
          const payload = (await response.json().catch(() => null)) as {
            error?: { message?: unknown };
          } | null;
          const message =
            typeof payload?.error?.message === "string"
              ? payload.error.message
              : undefined;
          throw new SSEHttpError(status, message);
        }

        // HTTP 握手成功后消费 SSE；收到 done/error 终止帧时 consume() 正常返回，
        // 不会进入重试分支。若流意外中断，consume() 会抛错并由下面的逻辑决定是否重试。
        this.setState(SSEState.OPEN);
        await this.consume(response);
        return;
      } catch (error) {
        // 用户取消连接不属于故障，直接退出循环。
        if (controller.signal.aborted) return;

        const normalizedError =
          error instanceof Error ? error : new Error(String(error));
        // 未启用重试、次数已用完或错误类型不适合重试时，把最终错误交回 connect()。
        if (
          !reconnectOptions ||
          this.retriesUsed >= maxRetries ||
          !this.shouldRetry(normalizedError)
        ) {
          throw normalizedError;
        }

        // 采用指数退避，并限制最大等待时间；加入随机抖动以避免多个客户端同时重试。
        this.retriesUsed += 1;
        const exponentialDelay = baseDelayMs * 2 ** (this.retriesUsed - 1);
        const cappedDelay = Math.min(maxDelayMs, Math.max(0, exponentialDelay));
        const delayMs = Math.round(cappedDelay * (0.8 + Math.random() * 0.4));

        // 通知调用方本次重试及等待时长；等待期间 close() 或外部 signal 都能中断。
        this.setState(SSEState.RETRYING);
        this.options.onRetry?.(this.retriesUsed, delayMs, normalizedError);
        await this.waitBeforeRetry(delayMs);

        // 等待结束后回到 connecting；循环下一轮会重新 fetch。
        if (!controller.signal.aborted) {
          this.setState(SSEState.CONNECTING);
        }
      }
    }
  }

  private createParser(): (chunk: Uint8Array) => void {
    return createSseParser(
      (frame: StreamFrame) => {
        if (this.terminal) return;

        if (frame.t === "delta") {
          this.emittedDelta = true;
        }
        if (frame.t === "done" || frame.t === "error") {
          this.terminal = true;
        }
        this.options.onFrame?.(frame);
      },
      (raw, error) => {
        console.error("解析 SSE 帧失败:", error, raw);
      },
    );
  }

  private async consume(response: Response): Promise<void> {
    if (!response.body) {
      throw new Error("响应流为空");
    }

    const reader = response.body.getReader();
    this.reader = reader;
    const parse = this.createParser();

    try {
      while (!this.terminal) {
        const { done, value } = await reader.read();
        if (done) break;
        parse(value);
      }

      if (!this.terminal) {
        throw new Error("SSE 流意外结束，未收到终止帧");
      }

      try {
        await reader.cancel();
      } catch (error) {
        console.warn("关闭 SSE 读取器失败:", error);
      }
    } finally {
      if (this.reader === reader) {
        this.reader = null;
      }
      reader.releaseLock();
    }
  }

  private shouldRetry(error: Error): boolean {
    // 终止帧表示服务端已结束本次业务；输出过增量文本时重跑会造成内容重复；
    // 已取消的连接也不应再次尝试。
    if (this.terminal || this.emittedDelta || this.controller?.signal.aborted) {
      return false;
    }

    // 只对常见的临时 HTTP 故障重试；其余 4xx 通常是请求或权限问题，重试无助于恢复。
    if (error instanceof SSEHttpError) {
      return (
        error.status === 408 ||
        error.status === 429 ||
        (error.status >= 500 && error.status <= 599)
      );
    }

    // fetch 网络异常、读取错误或未收到终止帧的意外 EOF 均视为可恢复故障。
    return true;
  }

  private async waitBeforeRetry(delayMs: number): Promise<void> {
    const signal = this.controller?.signal;
    // 没有活动连接、已取消或无需等待时，立即返回。
    if (!signal || signal.aborted || delayMs === 0) return;

    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      // 定时器到期或 signal 中止都会走同一清理路径，避免残留计时器和事件监听。
      const timer = setTimeout(finish, delayMs);
      signal.addEventListener("abort", finish, { once: true });
    });
  }

  close(): void {
    // 没有活动控制器时，说明当前没有可取消的连接或重试等待。
    if (!this.controller) return;

    // 取消控制器会中止 fetch 和退避等待；同时取消 reader 以尽快释放流资源。
    this.controller.abort();
    if (this.reader) {
      void this.reader.cancel().catch((error: unknown) => {
        console.warn("取消 SSE 读取器失败:", error);
      });
    }
    // 立即反映关闭状态；run() 退出后 connect() 也会保持该状态。
    this.setState(SSEState.CLOSED);
  }
}
