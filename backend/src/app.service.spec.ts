import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppService, READINESS_CHECK_TIMEOUT_MS } from './app.service';
import type { RateLimitService } from './common/rate-limit/rate-limit.service';
import type { PrismaService } from './prisma/prisma.service';

const SECRET_DETAIL =
  'connect ECONNREFUSED 10.0.0.5:5432 postgres://taskflow:s3cret@db/taskflow';

describe('AppService health checks', () => {
  const prisma = { $queryRaw: jest.fn() };
  const rateLimit = { ping: jest.fn() };
  let service: AppService;
  let warnLog: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    rateLimit.ping.mockResolvedValue(undefined);
    warnLog = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    service = new AppService(
      prisma as unknown as PrismaService,
      rateLimit as unknown as RateLimitService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function readinessError(): Promise<ServiceUnavailableException> {
    try {
      await service.readiness();
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      return error as ServiceUnavailableException;
    }
    throw new Error('readiness() resolved but was expected to fail');
  }

  const loggedText = () => warnLog.mock.calls.flat().map(String).join('\n');

  it('reports liveness without touching dependencies', () => {
    expect(service.liveness()).toEqual({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(rateLimit.ping).not.toHaveBeenCalled();
  });

  it('is ready when PostgreSQL and Redis respond', async () => {
    await expect(service.readiness()).resolves.toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(rateLimit.ping).toHaveBeenCalledTimes(1);
    expect(warnLog).not.toHaveBeenCalled();
  });

  it.each([
    ['PostgreSQL', 'database', { database: 'down', redis: 'up' }],
    ['Redis', 'redis', { database: 'up', redis: 'down' }],
  ] as const)(
    'is not ready when %s is unavailable',
    async (_label, failing, checks) => {
      const dependency =
        failing === 'database' ? prisma.$queryRaw : rateLimit.ping;
      dependency.mockRejectedValue(new Error(SECRET_DETAIL));

      const error = await readinessError();

      expect(error.getStatus()).toBe(503);
      expect(error.getResponse()).toEqual({
        code: 'SERVICE_NOT_READY',
        message: 'Service is not ready.',
        details: { checks },
      });
      expect(JSON.stringify(error.getResponse())).not.toContain('5432');
      expect(loggedText()).toBe(`Readiness check failed: ${failing} (Error)`);
      expect(loggedText()).not.toContain('s3cret');
      expect(loggedText()).not.toContain('10.0.0.5');
    },
  );

  it('reports both dependencies when both are unavailable', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error(SECRET_DETAIL));
    rateLimit.ping.mockRejectedValue(new Error(SECRET_DETAIL));

    const error = await readinessError();
    expect(error.getResponse()).toMatchObject({
      details: { checks: { database: 'down', redis: 'down' } },
    });
    expect(warnLog).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['PostgreSQL', 'database'],
    ['Redis', 'redis'],
  ] as const)(
    'marks %s down when its check exceeds the timeout',
    async (_label, hanging) => {
      jest.useFakeTimers();
      const never = new Promise<never>(() => undefined);
      if (hanging === 'database') prisma.$queryRaw.mockReturnValue(never);
      else rateLimit.ping.mockReturnValue(never);

      const pending = readinessError();
      await jest.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS);
      const error = await pending;

      expect(error.getResponse()).toMatchObject({
        details: {
          checks: {
            database: hanging === 'database' ? 'down' : 'up',
            redis: hanging === 'redis' ? 'down' : 'up',
          },
        },
      });
      expect(loggedText()).toBe(
        `Readiness check failed: ${hanging} (timed out after ${READINESS_CHECK_TIMEOUT_MS} ms)`,
      );
    },
  );

  it('runs checks in parallel so the total wait stays within one timeout', async () => {
    jest.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    prisma.$queryRaw.mockReturnValue(never);
    rateLimit.ping.mockReturnValue(never);

    let settled = false;
    const pending = readinessError().finally(() => {
      settled = true;
    });
    await jest.advanceTimersByTimeAsync(READINESS_CHECK_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
  });

  it('clears the timeout timer when a check finishes in time', async () => {
    jest.useFakeTimers();
    await service.readiness();
    expect(jest.getTimerCount()).toBe(0);
  });
});
