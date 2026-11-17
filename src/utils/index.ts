// 环形缓存，写满后覆盖最旧元素
class RingBuffer<T> {
  // 存储实际数据
  private buf: (T | undefined)[];
  // 写指针，永远指向下一个被写入的数组索引位置
  private write = 0;
  // 缓冲区有效数据量
  private size = 0;

  // capacity：缓冲区最大容量，通过readonly确保初始化后不可变
  constructor(private readonly capacity: number) {
    if (capacity <= 0) {
      throw new Error("capacity must be > 0");
    }
    this.buf = new Array(capacity);
  }

  // 写入，写满覆盖最旧的
  push(item: T): void {
    // 直接覆盖
    this.buf[this.write] = item;
    // 当指针移动到末尾时，自动回到数组开头
    this.write = (this.write + 1) % this.capacity;
    // 更新大小
    if (this.size < this.capacity) {
      this.size++;
    }
  }

  // 按照从旧到新的顺序导出快照
  toArray(): T[] {
    const out: T[] = [];
    const start = (this.write - this.size + this.capacity) % this.capacity;
    for (let i = 0; i < this.size; i++) {
      out.push(this.buf[(start + i) % this.capacity] as T);
    }
    return out;
  }

  get length(): number {
    return this.size;
  }
  clear(): void {
    this.buf = new Array(this.capacity);
    this.write = 0;
    this.size = 0;
  }
}
