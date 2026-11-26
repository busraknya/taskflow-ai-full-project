import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RATE_LIMITS } from './rate-limit.policies';
import { RateLimitService } from './rate-limit.service';
import {
  clientIpHash,
  sha256Prefix,
  throwTooManyRequests,
} from './rate-limit.util';

type AuthRatePolicy = {
  limit: number;
  windowSeconds: number;
};

const DEFAULT_POLICY: AuthRatePolicy = { limit: 10, windowSeconds: 60 };
const REFRESH_POLICY: AuthRatePolicy = { limit: 30, windowSeconds: 60 };

const AUTH_LIMIT_MESSAGE =
  'Too many authentication attempts. Please try again later.';

/**
 * Rate limiting for authentication and other abuse-sensitive endpoints.
 * All checks fail closed: RateLimitService throws 503 if Redis is down.
 *
 * - Per client IP and route (unchanged policy: 10/min, refresh 30/min).
 * - Login routes (web and mobile) additionally count attempts per account
 *   (normalized email) so distributed brute force from many IPs is bounded.
 *   Trade-off: an attacker can temporarily lock an account's login for at
 *   most one window; the limit is deliberately generous.
 */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const route = request.route as unknown as { path?: string } | undefined;
    const routePath = route?.path;
    const policy = routePath?.endsWith('refresh')
      ? REFRESH_POLICY
      : DEFAULT_POLICY;

    // Express resolves request.ip using TRUST_PROXY_HOPS configured at bootstrap.
    const routeKey = `${request.method}:${request.baseUrl}:${String(
      routePath || request.path,
    )}`;
    const key = `rate-limit:auth:${clientIpHash(request)}:${routeKey}`;

    const result = await this.rateLimit.consume(
      key,
      policy.limit,
      policy.windowSeconds,
    );

    response.setHeader('X-RateLimit-Limit', String(result.limit));
    response.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      throwTooManyRequests(response, result, AUTH_LIMIT_MESSAGE);
    }

    if (routePath?.endsWith('login')) {
      await this.enforceAccountLimit(request, response);
    }

    return true;
  }

  private async enforceAccountLimit(
    request: Request,
    response: Response,
  ): Promise<void> {
    const body = request.body as { email?: unknown } | undefined;
    const email = body?.email;
    // Invalid bodies are rejected by validation; there is no account to count.
    if (typeof email !== 'string' || email.trim() === '') return;

    const { limit, windowSeconds } = RATE_LIMITS.loginAccount;
    const result = await this.rateLimit.consume(
      `rate-limit:auth-account:${sha256Prefix(email.trim().toLowerCase())}`,
      limit,
      windowSeconds,
    );
    if (!result.allowed) {
      throwTooManyRequests(response, result, AUTH_LIMIT_MESSAGE);
    }
  }
}
