import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { describeError } from '../common/logging/log-sanitizer';
import { AiService } from './ai.service';
import { RiskFeatureService } from './risk-feature.service';
import {
  RISK_ASSESSMENT_QUEUE,
  RiskAssessmentJobData,
} from './risk-assessment.queue';

export type RiskAssessmentOutcome =
  | 'stored'
  | 'task-missing'
  | 'stale-version'
  | 'task-done'
  | 'no-features'
  | 'model-unavailable';

/**
 * Computes task risk asynchronously so task creation and updates never wait
 * for the ML service. Only predictions from a loaded model are stored.
 */
@Processor(RISK_ASSESSMENT_QUEUE)
export class RiskAssessmentProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskAssessmentProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskFeatureService: RiskFeatureService,
    private readonly aiService: AiService,
  ) {
    super();
  }

  async process(
    job: Job<RiskAssessmentJobData>,
  ): Promise<{ outcome: RiskAssessmentOutcome }> {
    const { taskId, workspaceId, taskVersion } = job.data;

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
      select: { version: true, status: true },
    });
    if (!task) {
      return { outcome: 'task-missing' };
    }
    // A newer edit enqueued its own job; that job assesses the latest state.
    if (task.version !== taskVersion) {
      return { outcome: 'stale-version' };
    }
    if (task.status === 'DONE') {
      return { outcome: 'task-done' };
    }

    const features =
      await this.riskFeatureService.extractFeaturesForTask(taskId);
    if (!features) {
      return { outcome: 'no-features' };
    }

    let prediction;
    try {
      prediction = await this.aiService.assessTaskRisk(features);
    } catch (error) {
      const { summary, stack } = describeError(error);
      this.logger.warn(
        `Risk assessment for task ${taskId} failed (attempt ${job.attemptsMade + 1}): ${summary}`,
        stack,
      );
      throw error; // BullMQ retries with backoff.
    }

    if (!prediction) {
      return { outcome: 'model-unavailable' };
    }

    await this.prisma.riskAssessment.create({
      data: {
        taskId,
        riskLevel: prediction.risk_level,
        riskScore: prediction.risk_score,
        factors: prediction.factors,
        modelVersion: prediction.model_version,
      },
    });
    return { outcome: 'stored' };
  }
}
