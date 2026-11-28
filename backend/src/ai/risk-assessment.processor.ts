import { Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { describeError } from '../common/logging/log-sanitizer';
import {
  RiskAssessmentSummary,
  RiskInferenceService,
} from './risk-inference.service';
import {
  RISK_ASSESSMENT_QUEUE,
  RISK_RECOMPUTE_ALL_JOB,
  RISK_RECOMPUTE_WORKSPACE_JOB,
  RiskAssessmentJobData,
  RiskQueueJobData,
  RiskRecomputeWorkspaceJobData,
} from './risk-assessment.queue';

export type RiskAssessmentResult =
  | { outcome: 'task-missing' | 'stale-version' }
  | { outcome: 'assessed'; summary: RiskAssessmentSummary }
  | { outcome: 'scheduled'; workspaces: number };

/**
 * Computes task risk asynchronously so task creation and updates never wait
 * for the ML service. Only predictions from a loaded model are stored.
 */
@Processor(RISK_ASSESSMENT_QUEUE)
export class RiskAssessmentProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskAssessmentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inference: RiskInferenceService,
    @InjectQueue(RISK_ASSESSMENT_QUEUE)
    private readonly queue: Queue<RiskQueueJobData>,
  ) {
    super();
  }

  async process(job: Job<RiskQueueJobData>): Promise<RiskAssessmentResult> {
    try {
      switch (job.name) {
        case RISK_RECOMPUTE_ALL_JOB:
          return await this.scheduleWorkspaces(job);
        case RISK_RECOMPUTE_WORKSPACE_JOB: {
          const { workspaceId } = job.data as RiskRecomputeWorkspaceJobData;
          const summary = await this.inference.assess(workspaceId);
          this.logger.log(
            `Daily risk recompute for workspace ${workspaceId}: ${JSON.stringify(summary)}`,
          );
          return { outcome: 'assessed', summary };
        }
        default:
          return await this.assessTask(job.data as RiskAssessmentJobData);
      }
    } catch (error) {
      const { summary, stack } = describeError(error);
      this.logger.warn(
        `Risk job ${job.name} failed (attempt ${job.attemptsMade + 1}): ${summary}`,
        stack,
      );
      throw error; // BullMQ retries with backoff.
    }
  }

  private async assessTask(
    data: RiskAssessmentJobData,
  ): Promise<RiskAssessmentResult> {
    const { taskId, workspaceId, taskVersion } = data;
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
      select: { version: true },
    });
    if (!task) {
      return { outcome: 'task-missing' };
    }
    // A newer edit enqueued its own job; that job assesses the latest state.
    if (task.version !== taskVersion) {
      return { outcome: 'stale-version' };
    }
    const summary = await this.inference.assess(workspaceId, [taskId]);
    return { outcome: 'assessed', summary };
  }

  private async scheduleWorkspaces(
    job: Job<RiskQueueJobData>,
  ): Promise<RiskAssessmentResult> {
    const workspaces = await this.prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    // One job per workspace and run; a retried scheduler job keeps its
    // timestamp and adds no duplicates. (Custom job ids cannot contain ':'.)
    const runKey = String(job.timestamp);
    await this.queue.addBulk(
      workspaces.map((workspace) => ({
        name: RISK_RECOMPUTE_WORKSPACE_JOB,
        data: { workspaceId: workspace.id },
        opts: {
          jobId: `recompute-${workspace.id}-${runKey}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 60_000 },
          removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
        },
      })),
    );
    return { outcome: 'scheduled', workspaces: workspaces.length };
  }
}
