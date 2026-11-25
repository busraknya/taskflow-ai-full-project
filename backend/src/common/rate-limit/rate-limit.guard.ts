import {
  CanActivate,
  ExecutionContext,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { RateLimitService } from './rate-limit.service';

type AuthRatePolicy = {
  limit: number;
  windowSeconds: number;
};

const DEFAULT_POLICY: AuthRatePolicy = { limit: 10, windowSeconds: 60 };
const REFRESH_POLICY: AuthRatePolicy = { limit: 30, windowSeconds: 60 };

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: RateLimitService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const route = request.route as unknown as { path?: string } | undefined;
    const routePath = route?.path;
    const policy =
      routePath === 'refresh' || routePath === 'mobile/refresh'
        ? REFRESH_POLICY
        : DEFAULT_POLICY;

    // Use the direct socket-derived IP unless a trusted proxy is explicitly configured.
    const clientIp = request.socket.remoteAddress || 'unknown';
    const ipHash = createHash('sha256')
      .update(clientIp)
      .digest('hex')
      .slice(0, 32);
    const routeKey = `${request.method}:${request.baseUrl}:${String(
      routePath || request.path,
    )}`;
    const key = `rate-limit:auth:${ipHash}:${routeKey}`;

    const result = await this.rateLimit.consume(
      key,
      policy.limit,
      policy.windowSeconds,
    );

    // Add an account-level bucket to make rotating source IPs less useful
    // against password guessing. Never store raw email addresses in Redis keys.
    if (routePath === 'login' || routePath === 'mobile/login') {
      const body = request.body as { email?: unknown } | undefined;
      const email =
        typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
      if (email) {
        const accountHash = createHash('sha256')
          .update(email)
          .digest('hex')
          .slice(0, 32);
        const accountResult = await this.rateLimit.consume(
          `rate-limit:auth:account:${accountHash}`,
          5,
          15 * 60,
        );
        if (!accountResult.allowed) {
          response.setHeader(
            'Retry-After',
            String(accountResult.retryAfterSeconds),
          );
          throw new HttpException(
            'Too many authentication attempts. Please try again later.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
    }

    response.setHeader('X-RateLimit-Limit', String(result.limit));
    response.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new HttpException(
        'Too many authentication attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
