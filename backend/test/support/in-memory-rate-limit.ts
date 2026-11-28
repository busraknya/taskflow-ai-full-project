import type { RateLimitResult } from '../../src/common/rate-limit/rate-limit.service';

/**
 * Test-only stand-in for RateLimitService (Redis fixed window). Keeps the
 * same contract so AuthRateLimitGuard runs unchanged in HTTP-level tests.
 */
export class InMemoryRateLimit {
  private counters = new Map<string, number>();

  consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const current = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, current);
    return Promise.resolve({
      allowed: current <= limit,
      limit,
      remaining: Math.max(0, limit - current),
      retryAfterSeconds: current <= limit ? 0 : windowSeconds,
    });
  }

  reset() {
    this.counters.clear();
  }

  onModuleDestroy() {}
}
