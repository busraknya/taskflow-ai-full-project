import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { describeError } from '../common/logging/log-sanitizer';
import { RiskModelService } from './risk-model.service';
import {
  EvaluateWorkspaceJobData,
  RISK_MODEL_EVALUATE_JOB,
  RISK_MODEL_QUEUE,
  RISK_MODEL_SCHEDULE_JOB,
  RISK_MODEL_TRAIN_JOB,
  RiskModelJobData,
  TrainWorkspaceJobData,
} from './risk-model.queue';

/**
 * Readiness and training jobs. Concurrency 1: one workspace at a time keeps
 * the load on the customer's server predictable. Feature building is
 * CPU-bound, hence the long lock.
 */
@Processor(RISK_MODEL_QUEUE, { concurrency: 1, lockDuration: 5 * 60_000 })
export class RiskModelProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskModelProcessor.name);

  constructor(private readonly service: RiskModelService) {
    super();
  }

  async process(job: Job<RiskModelJobData>): Promise<unknown> {
    try {
      switch (job.name) {
        case RISK_MODEL_SCHEDULE_JOB:
          // Custom job ids cannot contain ':'; the timestamp is stable on retry.
          return {
            workspaces: await this.service.scheduleAll(String(job.timestamp)),
          };
        case RISK_MODEL_EVALUATE_JOB:
          return await this.service.evaluateWorkspace(
            (job.data as EvaluateWorkspaceJobData).workspaceId,
          );
        case RISK_MODEL_TRAIN_JOB:
          await this.service.runTraining(
            (job.data as TrainWorkspaceJobData).runId,
          );
          return { done: true };
        default:
          return { ignored: job.name };
      }
    } catch (error) {
      const { summary, stack } = describeError(error);
      this.logger.warn(`Risk-model job ${job.name} failed: ${summary}`, stack);
      throw error;
    }
  }
}
