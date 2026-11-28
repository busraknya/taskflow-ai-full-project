import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { RATE_LIMITS, SKIP_RATE_LIMIT_KEY } from './rate-limit.policies';
import { RateLimitService } from './rate-limit.service';
import {
  ThrottledWarning,
  clientIpHash,
  throwTooManyRequests,
} from './rate-limit.util';

/**
 * Global per-IP baseline (registered as APP_GUARD). Runs before route guards,
 * so it also limits unauthenticated traffic and requests with invalid tokens.
 * The limit is generous enough for shared (NAT) addresses; stricter limits
 * are applied per endpoint and per user. Fails open on limiter outage.
 */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  private readonly outage = new ThrottledWarning(
    new Logger(IpRateLimitGuard.name),
  );

  constructor(
    private readonly rateLimit: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const skip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { limit, windowSeconds } = RATE_LIMITS.ipBaseline;

    let result;
    try {
      result = await this.rateLimit.consume(
        `rate-limit:ip:${clientIpHash(request)}`,
        limit,
        windowSeconds,
      );
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 503) {
        this.outage.log(
          'Rate limiter unavailable: per-IP baseline limit is not enforced (fail-open).',
        );
        return true;
      }
      throw error;
    }

    if (!result.allowed) {
      throwTooManyRequests(response, result);
    }
    return true;
  }
}
