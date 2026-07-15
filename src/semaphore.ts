/** Limits concurrent async work (per-profile LLM pools use this). */
export class Semaphore {
  private slots: number;
  private readonly waiters: Array<() => void> = [];

  constructor(max: number) {
    this.slots = Math.max(1, max);
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
    if (this.slots > 0) {
      this.slots--;
      return Promise.resolve();
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const next = this.waiters.shift();
    if (next) {
      next();
      return;
    }
    this.slots++;
  }
}
