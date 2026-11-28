import {
  ExecutionContext,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { IpRateLimitGuard } from './ip-rate-limit.guard';
import type { RateLimitService } from './rate-limit.service';

describe('IpRateLimitGuard (global per-IP baseline)', () => {
  const rateLimit = { consume: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn() };
  const guard = new IpRateLimitGuard(
    rateLimit as unknown as RateLimitService,
    reflector as unknown as Reflector,
  );
  const response = { setHeader: jest.fn() };
  let errorLog: jest.SpyInstance;

  function contextFor(ip: string) {
    const request = { ip, socket: { remoteAddress: ip } };
    return {
      getType: () => 'http',
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  const allowed = {
    allowed: true,
    limit: 600,
    remaining: 599,
    retryAfterSeconds: 60,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue(undefined);
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('allows requests within the baseline and keys them by client IP', async () => {
    rateLimit.consume.mockResolvedValue(allowed);

    await expect(guard.canActivate(contextFor('203.0.113.1'))).resolves.toBe(
      true,
    );
    expect(rateLimit.consume).toHaveBeenCalledWith(
      expect.stringMatching(/^rate-limit:ip:[a-f0-9]{32}$/),
      600,
      60,
    );
  });

  it('uses independent counters for different clients', async () => {
    rateLimit.consume.mockResolvedValue(allowed);

    await guard.canActivate(contextFor('203.0.113.1'));
    await guard.canActivate(contextFor('203.0.113.2'));

    const [first, second] = rateLimit.consume.mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    expect(first).not.toBe(second);
    expect(first).not.toContain('203.0.113.1');
  });

  it('returns 429 with Retry-After when the baseline is exceeded', async () => {
    rateLimit.consume.mockResolvedValue({
      allowed: false,
      limit: 600,
      remaining: 0,
      retryAfterSeconds: 12,
    });

    await expect(
      guard.canActivate(contextFor('203.0.113.1')),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
      response: { code: 'RATE_LIMITED' },
    });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '12');
  });

  it('skips routes marked with @SkipRateLimit (health checks)', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    await expect(guard.canActivate(contextFor('203.0.113.1'))).resolves.toBe(
      true,
    );
    expect(rateLimit.consume).not.toHaveBeenCalled();
  });

  it('fails open on limiter outage and logs the outage', async () => {
    rateLimit.consume.mockRejectedValue(
      new ServiceUnavailableException('limiter down'),
    );

    await expect(guard.canActivate(contextFor('203.0.113.1'))).resolves.toBe(
      true,
    );
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('fail-open'));
  });

  it('does not swallow unexpected errors', async () => {
    rateLimit.consume.mockRejectedValue(new InternalServerErrorException());

    await expect(
      guard.canActivate(contextFor('203.0.113.1')),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
