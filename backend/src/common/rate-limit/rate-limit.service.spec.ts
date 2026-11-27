import { ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { RateLimitService } from './rate-limit.service';

type RedisEval = (
  script: string,
  numberOfKeys: number,
  key: string,
  windowSeconds: string,
) => Promise<unknown>;

type RedisMock = {
  status: string;
  eval: jest.MockedFunction<RedisEval>;
  ping: jest.MockedFunction<() => Promise<string>>;
  connect: jest.MockedFunction<() => Promise<void>>;
  on: jest.MockedFunction<
    (event: string, listener: (...args: unknown[]) => void) => RedisMock
  >;
  once: jest.MockedFunction<
    (event: string, listener: (...args: unknown[]) => void) => RedisMock
  >;
  off: jest.MockedFunction<
    (event: string, listener: (...args: unknown[]) => void) => RedisMock
  >;
  disconnect: jest.MockedFunction<() => void>;
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    status: 'ready',
    eval: jest.fn<ReturnType<RedisEval>, Parameters<RedisEval>>(),
    ping: jest.fn<Promise<string>, []>().mockResolvedValue('PONG'),
    connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    on: jest
      .fn<RedisMock, [string, (...args: unknown[]) => void]>()
      .mockReturnThis(),
    once: jest
      .fn<RedisMock, [string, (...args: unknown[]) => void]>()
      .mockReturnThis(),
    off: jest
      .fn<RedisMock, [string, (...args: unknown[]) => void]>()
      .mockReturnThis(),
    disconnect: jest.fn<void, []>(),
  })),
}));

const redisConstructor = Redis as unknown as jest.MockedFunction<
  (...args: unknown[]) => RedisMock
>;

function latestRedisMock(): RedisMock {
  const results = redisConstructor.mock.results;
  const result = results[results.length - 1];
  if (!result || result.type !== 'return') {
    throw new Error('Redis mock instance was not created.');
  }
  return result.value;
}

describe('RateLimitService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      REDIS_HOST: 'redis',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: 'secret',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses an atomic Redis increment and returns the remaining quota', async () => {
    const service = new RateLimitService();
    const redis = latestRedisMock();
    redis.eval.mockResolvedValue([3, 42]);

    await expect(service.consume('rate-limit:test', 5, 60)).resolves.toEqual({
      allowed: true,
      limit: 5,
      remaining: 2,
      retryAfterSeconds: 42,
    });
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      1,
      'rate-limit:test',
      '60',
    );
    service.onModuleDestroy();
  });

  it('rejects requests above the configured limit', async () => {
    const service = new RateLimitService();
    const redis = latestRedisMock();
    redis.eval.mockResolvedValue([6, 12]);

    await expect(
      service.consume('rate-limit:test', 5, 60),
    ).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
    service.onModuleDestroy();
  });

  it('fails closed when Redis is unavailable', async () => {
    const service = new RateLimitService();
    const redis = latestRedisMock();
    redis.eval.mockRejectedValue(new Error('Redis unavailable'));

    await expect(
      service.consume('rate-limit:test', 5, 60),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    service.onModuleDestroy();
  });

  // Regression (SEC-02): after a failed attempt ioredis may end the
  // connection without emitting 'error' again; consume() must still fail
  // fast instead of waiting forever.
  it('fails closed when the connection ends without an error event', async () => {
    const service = new RateLimitService();
    const redis = latestRedisMock();
    redis.status = 'end';
    redis.connect.mockImplementation(() => new Promise<void>(() => undefined));
    redis.once.mockImplementation(function (
      this: RedisMock,
      event: string,
      listener: (...args: unknown[]) => void,
    ) {
      if (event === 'end') setImmediate(() => listener());
      return this;
    });

    await expect(
      service.consume('rate-limit:test', 5, 60),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(redis.eval).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('fails closed when no connection outcome arrives before the deadline', async () => {
    jest.useFakeTimers();
    try {
      const service = new RateLimitService();
      const redis = latestRedisMock();
      redis.status = 'connecting'; // another caller started connecting
      redis.once.mockReturnThis(); // neither 'ready', 'error' nor 'end' fires

      const pending = service.consume('rate-limit:test', 5, 60);
      const assertion = expect(pending).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await jest.advanceTimersByTimeAsync(3_500);
      await assertion;
      service.onModuleDestroy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('removes its connection listeners after a failed attempt', async () => {
    const service = new RateLimitService();
    const redis = latestRedisMock();
    redis.status = 'wait';
    redis.connect.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      service.consume('rate-limit:test', 5, 60),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    const removed = redis.off.mock.calls.map((call) => call[0]);
    expect(removed).toEqual(expect.arrayContaining(['ready', 'error', 'end']));
    service.onModuleDestroy();
  });

  it('requires valid Redis connection settings', () => {
    delete process.env.REDIS_HOST;

    expect(() => new RateLimitService()).toThrow(
      'valid REDIS_HOST and REDIS_PORT are required',
    );
  });

  describe('ping (readiness)', () => {
    it('resolves when Redis answers PONG', async () => {
      const service = new RateLimitService();
      await expect(service.ping()).resolves.toBeUndefined();
      expect(latestRedisMock().ping).toHaveBeenCalledTimes(1);
      service.onModuleDestroy();
    });

    it('rejects when Redis returns an unexpected reply', async () => {
      const service = new RateLimitService();
      latestRedisMock().ping.mockResolvedValue('LOADING');
      await expect(service.ping()).rejects.toThrow(
        'Unexpected Redis PING reply',
      );
      service.onModuleDestroy();
    });

    it('rejects without sending PING when the connection cannot be established', async () => {
      const service = new RateLimitService();
      const redis = latestRedisMock();
      redis.status = 'end';
      redis.connect.mockRejectedValue(new Error('connect ECONNREFUSED'));

      await expect(service.ping()).rejects.toThrow('connect ECONNREFUSED');
      expect(redis.ping).not.toHaveBeenCalled();
      service.onModuleDestroy();
    });
  });
});
