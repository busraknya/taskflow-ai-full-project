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

  it('requires valid Redis connection settings', () => {
    delete process.env.REDIS_HOST;

    expect(() => new RateLimitService()).toThrow(
      'valid REDIS_HOST and REDIS_PORT are required',
    );
  });
});
