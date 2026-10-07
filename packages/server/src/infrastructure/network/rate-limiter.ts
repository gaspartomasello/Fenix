/** Token bucket simple para limitar mensajes por conexión. */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  tryConsume(): boolean {
    const current = this.now();
    const elapsed = (current - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = current;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
