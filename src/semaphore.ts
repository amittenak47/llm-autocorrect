/** Limits concurrent async work (per-profile LLM pools use this). */
export class Semaphore {
  private max: number;
  private inUse = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(max: number) {
    this.max = Math.max(1, max);
  }

  setMax(n: number): void {
    this.max = Math.max(1, n);
    this.wakeWaiters();
  }

  async use<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.inUse < this.max) {
      this.inUse++;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    this.inUse--;
    this.wakeWaiters();
  }

  private wakeWaiters(): void {
    while (this.inUse < this.max && this.waiters.length > 0) {
      this.inUse++;
      this.waiters.shift()!();
    }
  }
}
