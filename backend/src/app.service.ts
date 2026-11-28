import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RateLimitService } from './common/rate-limit/rate-limit.service';
import { PrismaService } from './prisma/prisma.service';

/** Upper bound for each readiness check; checks run in parallel. */
export const READINESS_CHECK_TIMEOUT_MS = 2_000;

export type DependencyStatus = 'up' | 'down';

export interface ReadinessChecks {
  database: DependencyStatus;
  redis: DependencyStatus;
}

class CheckTimeoutError extends Error {
  constructor() {
    super('check timed out');
    this.name = 'CheckTimeoutError';
  }
}

@Injectable()
export class AppService {
  private readonly logger = new Logger('HealthCheck');

  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService,
  ) {}

  /** The process is running and able to serve HTTP requests. */
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * PostgreSQL and Redis are reachable. Responds 503 otherwise. Only up/down
   * per dependency is returned; error details are logged, never exposed.
   */
  async readiness(): Promise<{ status: 'ok'; checks: ReadinessChecks }> {
    const [database, redis] = await Promise.all([
      this.check('database', () => this.prisma.$queryRaw`SELECT 1`),
      this.check('redis', () => this.rateLimit.ping()),
    ]);
    const checks: ReadinessChecks = { database, redis };

    if (database === 'down' || redis === 'down') {
      throw new ServiceUnavailableException({
        code: 'SERVICE_NOT_READY',
        message: 'Service is not ready.',
        details: { checks },
      });
    }
    return { status: 'ok', checks };
  }

  private async check(
    name: keyof ReadinessChecks,
    probe: () => Promise<unknown>,
  ): Promise<DependencyStatus> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new CheckTimeoutError()),
        READINESS_CHECK_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([probe(), timeout]);
      return 'up';
    } catch (error) {
      // Only the error class is logged: messages from database or Redis
      // clients can contain hosts or connection details.
      const reason =
        error instanceof CheckTimeoutError
          ? `timed out after ${READINESS_CHECK_TIMEOUT_MS} ms`
          : error instanceof Error
            ? error.constructor.name
            : typeof error;
      this.logger.warn(`Readiness check failed: ${name} (${reason})`);
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}
