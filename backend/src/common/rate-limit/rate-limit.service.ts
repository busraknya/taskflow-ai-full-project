import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

const FIXED_WINDOW_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    const host = config.get<string>('REDIS_HOST');
    const port = Number(config.get<string>('REDIS_PORT'));

    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('FATAL: valid REDIS_HOST and REDIS_PORT are required.');
    }

    this.redis = new Redis({
      host,
      port,
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy: () => null,
    });
  }

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    try {
      const result = (await this.redis.eval(
        FIXED_WINDOW_SCRIPT,
        1,
        key,
        String(windowSeconds),
      )) as [number, number];

      const count = Number(result[0]);
      const ttl = Math.max(1, Number(result[1]));

      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: ttl,
      };
    } catch {
      // Authentication endpoints fail closed if the shared limiter is unavailable.
      throw new ServiceUnavailableException(
        'Authentication is temporarily unavailable. Please try again shortly.',
      );
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
