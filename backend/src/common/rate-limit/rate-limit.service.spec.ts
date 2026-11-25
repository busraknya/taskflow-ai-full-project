import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RateLimitService } from './rate-limit.service';

type RedisEval = (
  script: string,
  numberOfKeys: number,
  key: string,
  windowSeconds: string,
) => Promise<unknown>;

type RedisMock = {
  eval: jest.MockedFunction<RedisEval>;
  disconnect: jest.MockedFunction<() => void>;
};

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    eval: jest.fn<ReturnType<RedisEval>, Parameters<RedisEval>>(),
    disconnect: jest.fn<void, []>(),
  })),
}));

const redisConstructor = Redis as unknown as jest.MockedFunction<
  (...args: unknown[]) => RedisMock
>;

function latestRedisMock(): RedisMock {
  const result = redisConstructor.mock.results.at(-1);
  if (!result || result.type !== 'return') {
    throw new Error('Redis mock instance was not created.');
  }
  return result.value;
}

describe('RateLimitService', () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        REDIS_HOST: 'redis',
        REDIS_PORT: '6379',
        REDIS_PASSWORD: 'secret',
      };
      return values[key];
    }),
  };

  beforeEach(() => jest.clearAllMocks());

  it('uses an atomic Redis increment and returns the remaining quota', async () => {
    const service = new RateLimitService(config as unknown as ConfigService);
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
    const service = new RateLimitService(config as unknown as ConfigService);
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
    const service = new RateLimitService(config as unknown as ConfigService);
    const redis = latestRedisMock();
    redis.eval.mockRejectedValue(new Error('Redis unavailable'));

    await expect(
      service.consume('rate-limit:test', 5, 60),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    service.onModuleDestroy();
  });

  it('requires valid Redis connection settings', () => {
    const invalidConfig = {
      get: (key: string) => (key === 'REDIS_HOST' ? '' : '6379'),
    };

    expect(
      () => new RateLimitService(invalidConfig as unknown as ConfigService),
    ).toThrow('valid REDIS_HOST and REDIS_PORT are required');
  });
});
