import {
  Injectable,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
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
  private connectPromise: Promise<void> | null = null;

  constructor() {
    const host = process.env.REDIS_HOST;
    const port = Number(process.env.REDIS_PORT);

    if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('FATAL: valid REDIS_HOST and REDIS_PORT are required.');
    }

    this.redis = new Redis({
      host,
      port,
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      retryStrategy: () => null,
    });

    // ioredis emits connection errors independently of command promises.
    // Keep an error listener attached; consume() still fails closed on errors.
    this.redis.on('error', () => undefined);
  }

  private async ensureConnected(): Promise<void> {
    if (this.redis.status === 'ready') {
      return;
    }

    if (!this.connectPromise) {
      this.connectPromise = new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          this.redis.off('ready', onReady);
          this.redis.off('error', onError);
        };
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };

        this.redis.once('ready', onReady);
        this.redis.once('error', onError);

        if (this.redis.status === 'wait' || this.redis.status === 'end') {
          this.redis.connect().catch(onError);
        }
        // If another operation already started the connection, wait for
        // its ready/error event rather than calling connect() twice.
      }).finally(() => {
        this.connectPromise = null;
      });
    }

    await this.connectPromise;
  }

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    try {
      // lazyConnect + enableOfflineQueue:false requires an explicit awaited
      // connection before the first Redis command.
      await this.ensureConnected();

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
