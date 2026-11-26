import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import type { RateLimitResult } from './rate-limit.service';

export function sha256Prefix(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

/**
 * Client identity for IP-based limits. Express resolves request.ip from
 * X-Forwarded-For only for the number of proxy hops configured through
 * TRUST_PROXY_HOPS (main.ts); otherwise it is the socket address, so a
 * client cannot spoof it with its own headers.
 */
export function clientIpHash(request: Request): string {
  const ip = request.ip || request.socket?.remoteAddress || 'unknown';
  return sha256Prefix(ip);
}

/** Consistent 429 for every limiter: Retry-After header + error code. */
export function throwTooManyRequests(
  response: Response,
  result: RateLimitResult,
  message = 'Too many requests. Please try again later.',
): never {
  response.setHeader('Retry-After', String(result.retryAfterSeconds));
  throw new HttpException(
    { code: 'RATE_LIMITED', message },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/**
 * Logs limiter outages for fail-open policies at most once per interval so
 * a Redis outage is visible without flooding the logs.
 */
export class ThrottledWarning {
  private lastLoggedAt = 0;

  constructor(
    private readonly logger: Logger,
    private readonly intervalMs = 60_000,
  ) {}

  log(message: string): void {
    const now = Date.now();
    if (now - this.lastLoggedAt >= this.intervalMs) {
      this.lastLoggedAt = now;
      this.logger.error(message);
    }
  }
}
