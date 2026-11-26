class SimpleSSEClient {
  private eventSource: EventSource | null = null;
  private messageCount = 0;
  private reconnectCount = 0;
  url: string = "";

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    this.eventSource = new EventSource(this.url);

    this.eventSource.addEventListener("token", (e: MessageEvent) => {
      this.messageCount++;

      this.onToken(JSON.parse(e.data));
    });

    this.eventSource.addEventListener("done", () => {
      this.onDone();
      this.disconnect();
    });

    this.eventSource.addEventListener("error", (e: MessageEvent) => {
      // 错误处理
    });
  }
  disconnect() {
    this.eventSource?.close();
    this.eventSource = null;
  }
  protected onToken(data: any) {}
  protected onDone() {}
}
