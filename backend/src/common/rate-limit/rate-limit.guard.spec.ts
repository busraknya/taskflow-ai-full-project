import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AuthRateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

describe('AuthRateLimitGuard', () => {
  const rateLimit = { consume: jest.fn() };
  const guard = new AuthRateLimitGuard(rateLimit as unknown as RateLimitService);
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
    expect(response.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '8');
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

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      HttpException,
    ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
    expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '17');
  });
});
