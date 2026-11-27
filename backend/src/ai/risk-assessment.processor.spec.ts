import { Logger } from '@nestjs/common';
import type { Job, Queue } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service';
import type { RiskInferenceService } from './risk-inference.service';
import type { RiskQueueJobData } from './risk-assessment.queue';

// Keep the unit test isolated from Nest packages that ship ESM entry points.
jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => undefined,
  InjectQueue: () => () => undefined,
  WorkerHost: class WorkerHost {},
}));

import { RiskAssessmentProcessor } from './risk-assessment.processor';

const SUMMARY = {
  candidates: 1,
  predicted: 0,
  ineligible: {},
  modelUnavailable: true,
  withdrawn: 0,
};

describe('RiskAssessmentProcessor', () => {
  const prisma = {
    task: { findFirst: jest.fn() },
    workspace: { findMany: jest.fn() },
  };
  const inference = { assess: jest.fn() };
  const queue = { addBulk: jest.fn() };
  const processor = new RiskAssessmentProcessor(
    prisma as unknown as PrismaService,
    inference as unknown as RiskInferenceService,
    queue as unknown as Queue<RiskQueueJobData>,
  );

  const job = (name: string, data: unknown, timestamp = 0) =>
    ({ name, data, timestamp, attemptsMade: 0 }) as Job<RiskQueueJobData>;
  const assessJob = (taskVersion = 3) =>
    job('assess-task', { taskId: 'task-1', workspaceId: 'ws-1', taskVersion });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.task.findFirst.mockResolvedValue({ version: 3 });
    inference.assess.mockResolvedValue(SUMMARY);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reads the task only within its workspace and assesses that task', async () => {
    await expect(processor.process(assessJob())).resolves.toEqual({
      outcome: 'assessed',
      summary: SUMMARY,
    });
    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: 'task-1', workspaceId: 'ws-1', deletedAt: null },
      select: { version: true },
    });
    expect(inference.assess).toHaveBeenCalledWith('ws-1', ['task-1']);
  });

  it('skips jobs for missing tasks and stale versions', async () => {
    prisma.task.findFirst.mockResolvedValueOnce(null);
    await expect(processor.process(assessJob())).resolves.toEqual({
      outcome: 'task-missing',
    });
    await expect(processor.process(assessJob(2))).resolves.toEqual({
      outcome: 'stale-version',
    });
    expect(inference.assess).not.toHaveBeenCalled();
  });

  it('rethrows inference failures so BullMQ retries', async () => {
    const error = new Error('ML service unreachable');
    inference.assess.mockRejectedValue(error);
    await expect(processor.process(assessJob())).rejects.toBe(error);
  });

  it('recomputes a whole workspace', async () => {
    await processor.process(
      job('recompute-workspace', { workspaceId: 'ws-2' }),
    );
    expect(inference.assess).toHaveBeenCalledWith('ws-2');
  });

  it('fans the daily run out to one idempotent job per workspace', async () => {
    prisma.workspace.findMany.mockResolvedValue([
      { id: 'ws-1' },
      { id: 'ws-2' },
    ]);
    await expect(
      processor.process(job('recompute-all', {}, 1798768800000)),
    ).resolves.toEqual({ outcome: 'scheduled', workspaces: 2 });
    expect(prisma.workspace.findMany).toHaveBeenCalledWith({
      where: { deletedAt: null },
      select: { id: true },
    });
    const [[jobs]] = queue.addBulk.mock.calls as Array<
      [Array<{ name: string; data: unknown; opts: { jobId: string } }>]
    >;
    expect(jobs.map((j) => [j.name, j.data, j.opts.jobId])).toEqual([
      [
        'recompute-workspace',
        { workspaceId: 'ws-1' },
        'recompute-ws-1-1798768800000',
      ],
      [
        'recompute-workspace',
        { workspaceId: 'ws-2' },
        'recompute-ws-2-1798768800000',
      ],
    ]);
  });
});
