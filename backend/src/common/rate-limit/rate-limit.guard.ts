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
