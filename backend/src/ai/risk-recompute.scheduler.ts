import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { describeError } from '../common/logging/log-sanitizer';
import {
  RISK_ASSESSMENT_QUEUE,
  RISK_RECOMPUTE_ALL_JOB,
  RISK_RECOMPUTE_CRON,
  RISK_RECOMPUTE_SCHEDULER_ID,
  RiskQueueJobData,
} from './risk-assessment.queue';

/**
 * Registers the daily recompute of open tasks: time-dependent features such
 * as hours to deadline change even when nobody edits a task. Registration is
 * idempotent across restarts and replicas.
 */
@Injectable()
export class RiskRecomputeScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(RiskRecomputeScheduler.name);

  constructor(
    @InjectQueue(RISK_ASSESSMENT_QUEUE)
    private readonly queue: Queue<RiskQueueJobData>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        RISK_RECOMPUTE_SCHEDULER_ID,
        { pattern: RISK_RECOMPUTE_CRON, tz: 'UTC' },
        {
          name: RISK_RECOMPUTE_ALL_JOB,
          data: {},
          opts: {
            removeOnComplete: { age: 7 * 24 * 3600, count: 100 },
            removeOnFail: { age: 7 * 24 * 3600, count: 100 },
          },
        },
      );
    } catch (error) {
      // Startup must not depend on Redis; the next start registers it again.
      const { summary } = describeError(error);
      this.logger.error(`Could not register daily risk recompute: ${summary}`);
    }
  }
}
