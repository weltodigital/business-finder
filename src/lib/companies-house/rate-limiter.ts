/**
 * Companies House allows 600 requests per rolling 5 minutes per key.
 * We stay a little under that and serialise bursts so a big import can't
 * trip the limit for the whole application.
 */
export class RateLimiter {
  private timestamps: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly limit = 550,
    private readonly windowMs = 5 * 60_000,
    private readonly minGapMs = 60,
  ) {}

  /** Resolves when it is safe to issue the next request. */
  acquire(): Promise<void> {
    const run = this.queue.then(() => this.wait());
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async wait(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

      if (this.timestamps.length >= this.limit) {
        const oldest = this.timestamps[0];
        await sleep(this.windowMs - (now - oldest) + 50);
        continue;
      }

      const last = this.timestamps[this.timestamps.length - 1];
      if (last !== undefined && now - last < this.minGapMs) {
        await sleep(this.minGapMs - (now - last));
        continue;
      }

      this.timestamps.push(Date.now());
      return;
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const companiesHouseLimiter = new RateLimiter();
