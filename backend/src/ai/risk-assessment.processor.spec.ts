import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service';
import type { AiService } from './ai.service';
import type { RiskFeatureService } from './risk-feature.service';
import type { RiskAssessmentJobData } from './risk-assessment.queue';

// Keep the unit test isolated from Nest packages that ship ESM entry points.
jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  WorkerHost: class WorkerHost {},
}));

import { RiskAssessmentProcessor } from './risk-assessment.processor';

const FEATURES = {
  days_until_due: 3,
  assignee_active_task_count: 2,
  comment_count: 1,
  priority: 2,
};

describe('RiskAssessmentProcessor', () => {
  const prisma = {
    task: { findFirst: jest.fn() },
    riskAssessment: { create: jest.fn() },
  };
  const riskFeatures = { extractFeaturesForTask: jest.fn() };
  const ai = { assessTaskRisk: jest.fn() };
  const processor = new RiskAssessmentProcessor(
    prisma as unknown as PrismaService,
    riskFeatures as unknown as RiskFeatureService,
    ai as unknown as AiService,
  );
  let warnLog: jest.SpyInstance;

  const job = (taskVersion = 3) =>
    ({
      data: { taskId: 'task-1', workspaceId: 'ws-1', taskVersion },
      attemptsMade: 0,
    }) as Job<RiskAssessmentJobData>;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.task.findFirst.mockResolvedValue({ version: 3, status: 'TODO' });
    riskFeatures.extractFeaturesForTask.mockResolvedValue(FEATURES);
    warnLog = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reads the task only within its workspace', async () => {
    ai.assessTaskRisk.mockResolvedValue(null);
    await processor.process(job());
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: 'task-1', workspaceId: 'ws-1', deletedAt: null },
      select: { version: true, status: true },
    });
  });

  it('stores nothing when the ML service has no model', async () => {
    ai.assessTaskRisk.mockResolvedValue(null);

    await expect(processor.process(job())).resolves.toEqual({
      outcome: 'model-unavailable',
    });
    expect(ai.assessTaskRisk).toHaveBeenCalledWith(FEATURES);
    expect(prisma.riskAssessment.create).not.toHaveBeenCalled();
  });

  it('stores a prediction from a loaded model', async () => {
    ai.assessTaskRisk.mockResolvedValue({
      risk_level: 'HIGH',
      risk_score: null,
      model_version: 'ws-model-1',
      factors: [],
    });

    await expect(processor.process(job())).resolves.toEqual({
      outcome: 'stored',
    });
    expect(prisma.riskAssessment.create).toHaveBeenCalledWith({
      data: {
        taskId: 'task-1',
        riskLevel: 'HIGH',
        riskScore: null,
        factors: [],
        modelVersion: 'ws-model-1',
      },
    });
  });

  it.each([
    ['the task no longer exists', null, 'task-missing'],
    [
      'a newer task version was saved',
      { version: 4, status: 'TODO' },
      'stale-version',
    ],
    ['the task is done', { version: 3, status: 'DONE' }, 'task-done'],
  ])('skips the assessment when %s', async (_label, task, outcome) => {
    prisma.task.findFirst.mockResolvedValue(task);

    await expect(processor.process(job())).resolves.toEqual({ outcome });
    expect(ai.assessTaskRisk).not.toHaveBeenCalled();
    expect(prisma.riskAssessment.create).not.toHaveBeenCalled();
  });

  it('skips the assessment when no features can be extracted', async () => {
    riskFeatures.extractFeaturesForTask.mockResolvedValue(null);
    await expect(processor.process(job())).resolves.toEqual({
      outcome: 'no-features',
    });
    expect(ai.assessTaskRisk).not.toHaveBeenCalled();
  });

  it('rethrows ML failures so BullMQ retries, storing no placeholder result', async () => {
    const failure = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    ai.assessTaskRisk.mockRejectedValue(failure);

    await expect(processor.process(job())).rejects.toBe(failure);
    expect(prisma.riskAssessment.create).not.toHaveBeenCalled();
    const [firstWarning] = warnLog.mock.calls as unknown[][];
    expect(String(firstWarning?.[0])).toBe(
      'Risk assessment for task task-1 failed (attempt 1): Error (code=ECONNREFUSED)',
    );
  });
});
