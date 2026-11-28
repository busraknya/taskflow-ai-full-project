import { ForbiddenException, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { PrismaService } from '../prisma/prisma.service';
import type { AiService } from '../ai/ai.service';

jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => undefined }));
jest.mock('@nestjs/axios', () => ({ HttpService: class HttpService {} }));

import { TrainingInProgressError } from '../ai/ai.service';
import type { Readiness } from './readiness';
import type { RiskModelJobData } from './risk-model.queue';
import { RiskModelService } from './risk-model.service';

const READY = { ready: true, labelableTasks: 400 } as Readiness;
const ROWS = [
  {
    taskId: 't1',
    projectId: 'p1',
    asOf: new Date('2026-11-01T00:00:00Z'),
    label: 1 as const,
    features: {} as never,
  },
];

describe('RiskModelService', () => {
  const prisma = {
    workspace: { findFirst: jest.fn(), update: jest.fn() },
    riskModelTraining: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };
  const ai = { train: jest.fn() };
  const queue = { add: jest.fn() };
  const service = new RiskModelService(
    prisma as unknown as PrismaService,
    ai as unknown as AiService,
    queue as unknown as Queue<RiskModelJobData>,
  );
  const lastUpdate = () =>
    (
      prisma.riskModelTraining.update.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >
    ).at(-1)![0].data;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prisma.riskModelTraining.findUnique.mockResolvedValue({
      id: 'r1',
      workspaceId: 'ws',
      status: 'QUEUED',
    });
    prisma.workspace.findFirst.mockResolvedValue({ riskTrainingEnabled: true });
  });

  afterEach(() => jest.restoreAllMocks());

  it('stores the promoted model version and report', async () => {
    ai.train.mockResolvedValue({
      report: {
        decision: 'promoted',
        modelVersion: 'm2',
        reasons: [],
        gates: [],
      },
      activeModelVersion: 'm2',
    });
    await service.runTraining('r1', { rows: ROWS, readiness: READY });
    expect(ai.train).toHaveBeenCalledWith('ws', [
      {
        taskId: 't1',
        projectId: 'p1',
        asOf: '2026-11-01T00:00:00.000Z',
        label: 1,
        features: {},
      },
    ]);
    expect(lastUpdate()).toMatchObject({
      status: 'PROMOTED',
      modelVersion: 'm2',
      labelableTasks: 400,
    });
  });

  it('records a rejected model without a model version', async () => {
    ai.train.mockResolvedValue({
      report: {
        decision: 'rejected',
        modelVersion: 'm3',
        reasons: ['gate-failed: beats-baselines'],
        gates: [],
      },
      activeModelVersion: 'm2',
    });
    await service.runTraining('r1', { rows: ROWS, readiness: READY });
    expect(lastUpdate()).toMatchObject({
      status: 'REJECTED',
      modelVersion: null,
    });
  });

  it('marks the run failed with a generic message when the ML service fails', async () => {
    ai.train.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:8000'));
    await service.runTraining('r1', { rows: ROWS, readiness: READY });
    expect(lastUpdate()).toEqual(
      expect.objectContaining({
        status: 'FAILED',
        error: 'Training failed; see the backend logs.',
      }),
    );

    ai.train.mockRejectedValue(new TrainingInProgressError('busy'));
    await service.runTraining('r1', { rows: ROWS, readiness: READY });
    expect(lastUpdate()).toMatchObject({
      error: 'Another training was running on the model service.',
    });
  });

  it('does not train when readiness fails or training was disabled meanwhile', async () => {
    await service.runTraining('r1', {
      rows: ROWS,
      readiness: { ...READY, ready: false },
    });
    expect(lastUpdate()).toMatchObject({ status: 'NOT_READY' });

    prisma.workspace.findFirst.mockResolvedValue({
      riskTrainingEnabled: false,
    });
    await service.runTraining('r1', { rows: ROWS, readiness: READY });
    expect(lastUpdate()).toMatchObject({
      status: 'FAILED',
      error: 'Training is disabled.',
    });
    expect(ai.train).not.toHaveBeenCalled();
  });

  it('ignores runs that are no longer queued', async () => {
    prisma.riskModelTraining.findUnique.mockResolvedValue({
      id: 'r1',
      workspaceId: 'ws',
      status: 'PROMOTED',
    });
    await service.runTraining('r1', { rows: ROWS, readiness: READY });
    expect(prisma.riskModelTraining.update).not.toHaveBeenCalled();
  });

  it.each(['MEMBER', 'VIEWER'])('refuses management by %s', async (role) => {
    await expect(
      service.setTrainingEnabled('ws', role as never, true),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.requestTraining('ws', role as never, 'u1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.rollback('ws', role as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });
});
