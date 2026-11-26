import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import {
  SENSITIVE_RATE_POLICY_KEY,
  SKIP_RATE_LIMIT_KEY,
} from './rate-limit.policies';
import type { RateLimitService } from './rate-limit.service';
import { UserRateLimitInterceptor } from './user-rate-limit.interceptor';

describe('UserRateLimitInterceptor (per-user limits)', () => {
  const rateLimit = { consume: jest.fn() };
  const metadata: Record<string, unknown> = {};
  const reflector = {
    getAllAndOverride: jest.fn((key: string) => metadata[key]),
  };
  const interceptor = new UserRateLimitInterceptor(
    rateLimit as unknown as RateLimitService,
    reflector as unknown as Reflector,
  );
  const response = { setHeader: jest.fn() };
  const handle = jest.fn(() => of('handled'));
  const handler: CallHandler = { handle };
  let errorLog: jest.SpyInstance;

  const allowed = {
    allowed: true,
    limit: 100,
    remaining: 99,
    retryAfterSeconds: 60,
  };
  const denied = {
    allowed: false,
    limit: 5,
    remaining: 0,
    retryAfterSeconds: 120,
  };

  function run(method: string, user?: { id: string }) {
    const request = { method, user };
    const context = {
      getType: () => 'http',
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
    return lastValueFrom(interceptor.intercept(context, handler));
  }

  const keys = () =>
    rateLimit.consume.mock.calls.map((call: unknown[]) => call[0] as string);

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(metadata)) delete metadata[key];
    rateLimit.consume.mockResolvedValue(allowed);
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('skips unauthenticated requests (covered by IP and auth limits)', async () => {
    await expect(run('POST')).resolves.toBe('handled');
    expect(rateLimit.consume).not.toHaveBeenCalled();
  });

  it('applies the read policy to GET requests', async () => {
    await expect(run('GET', { id: 'user-1' })).resolves.toBe('handled');
    expect(rateLimit.consume).toHaveBeenCalledWith(
      'rate-limit:user:user-1:read',
      300,
      60,
    );
  });

  it('applies the stricter write policy to mutations', async () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      await run(method, { id: 'user-1' });
    }
    expect(keys()).toEqual(
      Array(4).fill('rate-limit:user:user-1:write') as string[],
    );
    expect(rateLimit.consume).toHaveBeenCalledWith(expect.any(String), 120, 60);
  });

  it('keys counters by user so one user cannot exhaust another', async () => {
    await run('POST', { id: 'alice' });
    await run('POST', { id: 'bob' });
    expect(keys()).toEqual([
      'rate-limit:user:alice:write',
      'rate-limit:user:bob:write',
    ]);
  });

  it('returns 429 with Retry-After when the baseline is exceeded', async () => {
    rateLimit.consume.mockResolvedValue(denied);

    await expect(run('POST', { id: 'user-1' })).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { code: 'RATE_LIMITED' },
    });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '120');
    expect(handle).not.toHaveBeenCalled();
  });

  it('enforces sensitive per-user policies in addition to the baseline', async () => {
    metadata[SENSITIVE_RATE_POLICY_KEY] = 'password-change';
    rateLimit.consume
      .mockResolvedValueOnce(allowed) // write baseline
      .mockResolvedValueOnce(denied); // password-change policy

    await expect(run('PATCH', { id: 'user-1' })).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(rateLimit.consume).toHaveBeenLastCalledWith(
      'rate-limit:user:user-1:password-change',
      5,
      900,
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('fails open for baseline limits on limiter outage and logs it', async () => {
    rateLimit.consume.mockRejectedValue(
      new ServiceUnavailableException('limiter down'),
    );

    await expect(run('GET', { id: 'user-1' })).resolves.toBe('handled');
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('fail-open'));
  });

  it('fails closed for sensitive policies on limiter outage', async () => {
    metadata[SENSITIVE_RATE_POLICY_KEY] = 'workspace-invite';
    rateLimit.consume.mockRejectedValue(
      new ServiceUnavailableException('limiter down'),
    );

    await expect(run('POST', { id: 'user-1' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('skips routes marked with @SkipRateLimit', async () => {
    metadata[SKIP_RATE_LIMIT_KEY] = true;
    await expect(run('GET', { id: 'user-1' })).resolves.toBe('handled');
    expect(rateLimit.consume).not.toHaveBeenCalled();
  });
});
