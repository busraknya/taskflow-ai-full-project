import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from './rate-limit.service';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    eval: jest.fn(),
    disconnect: jest.fn(),
  }));
});

import Redis from 'ioredis';

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
    const redis = (Redis as unknown as jest.Mock).mock.results[0].value;
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
    await service.onModuleDestroy();
  });

  it('rejects requests above the configured limit', async () => {
    const service = new RateLimitService(config as unknown as ConfigService);
    const redis = (Redis as unknown as jest.Mock).mock.results[1].value;
    redis.eval.mockResolvedValue([6, 12]);

    await expect(service.consume('rate-limit:test', 5, 60)).resolves.toMatchObject({
      allowed: false,
      remaining: 0,
    });
    await service.onModuleDestroy();
  });

  it('fails closed when Redis is unavailable', async () => {
    const service = new RateLimitService(config as unknown as ConfigService);
    const redis = (Redis as unknown as jest.Mock).mock.results[2].value;
    redis.eval.mockRejectedValue(new Error('Redis unavailable'));

    await expect(service.consume('rate-limit:test', 5, 60)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await service.onModuleDestroy();
  });

  it('requires valid Redis connection settings', () => {
    const invalidConfig = {
      get: (key: string) => (key === 'REDIS_HOST' ? '' : '6379'),
    };

    expect(
      () => new RateLimitService(invalidConfig as unknown as ConfigService),
    ).toThrow('valid REDIS_HOST and REDIS_PORT are required');
  });
}
