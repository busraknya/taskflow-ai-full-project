import {
  ExecutionContext,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthRateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

describe('AuthRateLimitGuard', () => {
  const rateLimit = { consume: jest.fn() };
  const guard = new AuthRateLimitGuard(
    rateLimit as unknown as RateLimitService,
  );
  const response = {
    setHeader: jest.fn(),
  };
  const request = {
    method: 'POST',
    baseUrl: '/api/v1/auth',
    route: { path: 'login' },
    path: '/api/v1/auth/login',
    ip: '203.0.113.10',
    socket: { remoteAddress: '203.0.113.10' },
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  beforeEach(() => jest.clearAllMocks());

  it('allows requests and emits quota headers', async () => {
    rateLimit.consume.mockResolvedValue({
      allowed: true,
      limit: 10,
      remaining: 8,
      retryAfterSeconds: 50,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(rateLimit.consume).toHaveBeenCalledWith(
      expect.stringMatching(/^rate-limit:auth:[a-f0-9]{32}:POST:/),
      10,
      60,
    );
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-RateLimit-Remaining',
      '8',
    );
  });

  it('uses a separate higher policy for refresh requests', async () => {
    request.route.path = 'mobile/refresh';
    rateLimit.consume.mockResolvedValue({
      allowed: true,
      limit: 30,
      remaining: 29,
      retryAfterSeconds: 60,
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(rateLimit.consume).toHaveBeenCalledWith(expect.any(String), 30, 60);
    request.route.path = 'login';
  });

  it('rejects requests over the limit and emits Retry-After', async () => {
    rateLimit.consume.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      retryAfterSeconds: 17,
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '17');
  });

  // ---------- SEC-02: per-account login limit ----------

  const allowed = {
    allowed: true,
    limit: 10,
    remaining: 9,
    retryAfterSeconds: 60,
  };

  function loginContext(ip: string, path: string, body: unknown) {
    const req = { ...request, ip, route: { path }, body };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext;
  }

  function accountKeys(): string[] {
    return rateLimit.consume.mock.calls
      .map((call: unknown[]) => call[0] as string)
      .filter((key) => key.startsWith('rate-limit:auth-account:'));
  }

  it('counts login attempts per account across different IPs', async () => {
    rateLimit.consume.mockResolvedValue(allowed);

    await guard.canActivate(
      loginContext('198.51.100.1', 'login', { email: 'Victim@Example.com ' }),
    );
    await guard.canActivate(
      loginContext('198.51.100.2', 'mobile/login', {
        email: 'victim@example.com',
      }),
    );

    const keys = accountKeys();
    expect(keys).toHaveLength(2);
    // Same normalized account -> same counter, regardless of IP/transport.
    expect(keys[0]).toBe(keys[1]);
    expect(rateLimit.consume).toHaveBeenCalledWith(keys[0], 20, 900);
  });

  it('keeps separate account counters for different users', async () => {
    rateLimit.consume.mockResolvedValue(allowed);

    await guard.canActivate(
      loginContext('198.51.100.1', 'login', { email: 'alice@example.com' }),
    );
    await guard.canActivate(
      loginContext('198.51.100.1', 'login', { email: 'bob@example.com' }),
    );

    const [alice, bob] = accountKeys();
    expect(alice).not.toBe(bob);
    // The raw email never appears in the Redis key.
    expect(alice).not.toContain('alice');
  });

  it('rejects a login when the account limit is exceeded', async () => {
    rateLimit.consume
      .mockResolvedValueOnce(allowed) // per-IP check passes
      .mockResolvedValueOnce({
        allowed: false,
        limit: 20,
        remaining: 0,
        retryAfterSeconds: 300,
      });

    await expect(
      guard.canActivate(
        loginContext('198.51.100.9', 'login', { email: 'victim@example.com' }),
      ),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '300');
  });

  it('does not consume the account counter when the IP is already blocked', async () => {
    rateLimit.consume.mockResolvedValueOnce({
      allowed: false,
      limit: 10,
      remaining: 0,
      retryAfterSeconds: 30,
    });

    await expect(
      guard.canActivate(
        loginContext('198.51.100.9', 'login', { email: 'victim@example.com' }),
      ),
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(accountKeys()).toHaveLength(0);
  });

  it('only applies the account limit to login routes with a string email', async () => {
    rateLimit.consume.mockResolvedValue(allowed);

    await guard.canActivate(
      loginContext('198.51.100.1', 'register', { email: 'a@example.com' }),
    );
    await guard.canActivate(
      loginContext('198.51.100.1', 'mobile/refresh', { refreshToken: 'x' }),
    );
    await guard.canActivate(
      loginContext('198.51.100.1', 'login', { email: { $ne: null } }),
    );
    expect(accountKeys()).toHaveLength(0);
  });

  it('returns a consistent RATE_LIMITED error body', async () => {
    rateLimit.consume.mockResolvedValue({
      allowed: false,
      limit: 10,
      remaining: 0,
      retryAfterSeconds: 5,
    });

    await expect(guard.canActivate(context)).rejects.toMatchObject({
      response: { code: 'RATE_LIMITED' },
    });
  });

  it('fails closed when the limiter is unavailable', async () => {
    rateLimit.consume.mockRejectedValue(
      new ServiceUnavailableException('limiter down'),
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
