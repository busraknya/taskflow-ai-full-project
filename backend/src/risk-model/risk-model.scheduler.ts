import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { describeError } from '../common/logging/log-sanitizer';
import {
  RISK_MODEL_CRON,
  RISK_MODEL_QUEUE,
  RISK_MODEL_SCHEDULE_JOB,
  RISK_MODEL_SCHEDULER_ID,
  RiskModelJobData,
} from './risk-model.queue';

/** Registers the nightly readiness/training run (idempotent). */
@Injectable()
export class RiskModelScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(RiskModelScheduler.name);

  constructor(
    @InjectQueue(RISK_MODEL_QUEUE)
    private readonly queue: Queue<RiskModelJobData>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        RISK_MODEL_SCHEDULER_ID,
        { pattern: RISK_MODEL_CRON, tz: 'UTC' },
        {
          name: RISK_MODEL_SCHEDULE_JOB,
          data: {},
          opts: {
            removeOnComplete: { age: 30 * 24 * 3600, count: 100 },
            removeOnFail: { age: 30 * 24 * 3600, count: 100 },
          },
        },
      );
    } catch (error) {
      this.logger.error(
        `Could not register nightly risk-model training: ${describeError(error).summary}`,
      );
    }
  }
}
