import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, from, switchMap } from 'rxjs';
import {
  RATE_LIMITS,
  SENSITIVE_RATE_LIMITS,
  SENSITIVE_RATE_POLICY_KEY,
  SKIP_RATE_LIMIT_KEY,
  type SensitiveRatePolicyName,
} from './rate-limit.policies';
import { RateLimitService } from './rate-limit.service';
import { ThrottledWarning, throwTooManyRequests } from './rate-limit.util';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

type MaybeAuthenticatedRequest = Request & { user?: { id?: unknown } };

/**
 * Per-user limits (registered as APP_INTERCEPTOR). Interceptors run after
 * guards, so the authenticated user id is known and the limit follows the
 * account across IP addresses. Counters are keyed by the caller's own id, so
 * one user can never exhaust another user's quota.
 *
 * - Baseline read/write limits apply to every authenticated request and fail
 *   open on limiter outage (logged).
 * - Routes marked with @SensitiveRateLimit get an additional strict limit
 *   that fails closed (503) when the limiter is unavailable.
 * Unauthenticated requests are covered by the IP baseline and auth guards.
 */
@Injectable()
export class UserRateLimitInterceptor implements NestInterceptor {
  private readonly outage = new ThrottledWarning(
    new Logger(UserRateLimitInterceptor.name),
  );

  constructor(
    private readonly rateLimit: RateLimitService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    return from(this.enforce(context)).pipe(switchMap(() => next.handle()));
  }

  private async enforce(context: ExecutionContext): Promise<void> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, targets)
    ) {
      return;
    }

    const request = context
      .switchToHttp()
      .getRequest<MaybeAuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const userId = request.user?.id;
    if (typeof userId !== 'string' || userId.length === 0) return;

    const isRead = READ_METHODS.has(request.method.toUpperCase());
    const baseline = isRead ? RATE_LIMITS.userRead : RATE_LIMITS.userWrite;
    await this.consumeBaseline(
      `rate-limit:user:${userId}:${isRead ? 'read' : 'write'}`,
      baseline.limit,
      baseline.windowSeconds,
      response,
    );

    const sensitive = this.reflector.getAllAndOverride<
      SensitiveRatePolicyName | undefined
    >(SENSITIVE_RATE_POLICY_KEY, targets);
    if (sensitive) {
      const policy = SENSITIVE_RATE_LIMITS[sensitive];
      // Fail closed: RateLimitService throws 503 if Redis is unavailable.
      const result = await this.rateLimit.consume(
        `rate-limit:user:${userId}:${sensitive}`,
        policy.limit,
        policy.windowSeconds,
      );
      if (!result.allowed) {
        throwTooManyRequests(
          response,
          result,
          'Too many attempts for this operation. Please try again later.',
        );
      }
    }
  }

  private async consumeBaseline(
    key: string,
    limit: number,
    windowSeconds: number,
    response: Response,
  ): Promise<void> {
    let result;
    try {
      result = await this.rateLimit.consume(key, limit, windowSeconds);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 503) {
        this.outage.log(
          'Rate limiter unavailable: per-user baseline limit is not enforced (fail-open).',
        );
        return;
      }
      throw error;
    }
    if (!result.allowed) {
      throwTooManyRequests(response, result);
    }
  }
}
