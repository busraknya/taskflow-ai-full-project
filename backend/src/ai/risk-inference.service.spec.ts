import { buildEvents } from '../../test/support/event-history';
import type { PrismaService } from '../prisma/prisma.service';
import { FEATURE_SPEC_VERSION } from '../risk-features/feature-spec';
import type { AiService } from './ai.service';

// ai.service imports the ESM-only @nestjs/axios package.
jest.mock('@nestjs/axios', () => ({ HttpService: class HttpService {} }));

import { RiskInferenceService } from './risk-inference.service';

const NOW = new Date('2026-11-10T00:00:00Z');
const DUE = { dueDate: '2026-11-20T00:00:00.000Z', dueDateIsDateOnly: true };

type TaskRow = {
  id: string;
  projectId: string;
  assigneeId: string | null;
  deletedAt: Date | null;
  project: { deletedAt: Date | null };
  events: ReturnType<typeof buildEvents>;
};

function row(
  id: string,
  events: TaskRow['events'],
  assigneeId: string | null = null,
): TaskRow {
  return {
    id,
    projectId: 'p1',
    assigneeId,
    deletedAt: null,
    project: { deletedAt: null },
    events,
  };
}

describe('RiskInferenceService', () => {
  let tasks: TaskRow[];
  let latest: Array<{ taskId: string; riskLevel: string }>;
  const prisma = {
    workspace: { findFirst: jest.fn() },
    task: { findMany: jest.fn() },
    taskEvent: { findMany: jest.fn() },
    riskAssessment: { findMany: jest.fn(), createMany: jest.fn() },
  };
  const ai = { predictBatch: jest.fn() };
  const service = new RiskInferenceService(
    prisma as unknown as PrismaService,
    ai as unknown as AiService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    tasks = [];
    latest = [];
    prisma.workspace.findFirst.mockResolvedValue({
      timezone: 'UTC',
      riskTrainingEnabled: true,
    });
    prisma.task.findMany.mockImplementation(
      ({
        where,
      }: {
        where: { id?: { in: string[] }; assigneeId?: { in: string[] } };
      }) =>
        Promise.resolve(
          tasks
            .filter((t) => !where.id || where.id.in.includes(t.id))
            .filter(
              (t) =>
                !where.assigneeId ||
                (t.assigneeId && where.assigneeId.in.includes(t.assigneeId)),
            )
            .map((t) => ({ ...t, events: undefined })),
        ),
    );
    prisma.taskEvent.findMany.mockImplementation(
      ({ where }: { where: { taskId: { in: string[] } } }) =>
        Promise.resolve(
          tasks
            .filter((t) => where.taskId.in.includes(t.id))
            .flatMap((t) => t.events.map((e) => ({ ...e, taskId: t.id }))),
        ),
    );
    prisma.riskAssessment.findMany.mockImplementation(() =>
      Promise.resolve(latest),
    );
    prisma.riskAssessment.createMany.mockResolvedValue({ count: 0 });
  });

  const stored = () =>
    (
      prisma.riskAssessment.createMany.mock.calls as Array<
        [{ data: Array<Record<string, unknown>> }]
      >
    )[0]?.[0].data ?? [];

  it('scopes every query to the workspace', async () => {
    tasks = [
      row(
        't1',
        buildEvents('2026-11-01T00:00:00Z', { ...DUE, assigneeId: 'u1' }),
        'u1',
      ),
    ];
    ai.predictBatch.mockResolvedValue(null);
    await service.assess('ws-1', undefined, NOW);
    expect(prisma.workspace.findFirst).toHaveBeenCalledWith({
      where: { id: 'ws-1', deletedAt: null },
      select: { timezone: true, riskTrainingEnabled: true },
    });
    for (const [query] of prisma.task.findMany.mock.calls as Array<
      [{ where: { workspaceId: string } }]
    >) {
      expect(query.where.workspaceId).toBe('ws-1');
    }
    for (const [query] of prisma.taskEvent.findMany.mock.calls as Array<
      [{ where: { workspaceId: string } }]
    >) {
      expect(query.where.workspaceId).toBe('ws-1');
    }
    expect(ai.predictBatch).toHaveBeenCalledWith('ws-1', expect.any(Array));
  });

  it('stores model predictions with the exact features sent', async () => {
    tasks = [row('t1', buildEvents('2026-11-01T00:00:00Z', DUE))];
    ai.predictBatch.mockResolvedValue({
      modelVersion: 'ws-1-model-3',
      results: [{ taskId: 't1', riskLevel: 'HIGH', probability: 0.71 }],
    });
    const summary = await service.assess('ws-1', ['t1'], NOW);

    const [, items] = ai.predictBatch.mock.calls[0] as [
      string,
      Array<{ taskId: string; features: Record<string, number> }>,
    ];
    expect(items).toHaveLength(1);
    expect(items[0].features.hours_to_deadline).toBe(11 * 24);
    expect(stored()).toEqual([
      {
        taskId: 't1',
        riskLevel: 'HIGH',
        riskScore: 0.71,
        factors: [],
        modelVersion: 'ws-1-model-3',
        featureSpecVersion: FEATURE_SPEC_VERSION,
        featureSnapshot: items[0].features,
      },
    ]);
    expect(summary).toMatchObject({
      candidates: 1,
      predicted: 1,
      modelUnavailable: false,
    });
  });

  it('never calls the model for ineligible tasks', async () => {
    tasks = [
      row('no-due', buildEvents('2026-11-01T00:00:00Z', {})),
      row(
        'overdue',
        buildEvents('2026-11-01T00:00:00Z', {
          dueDate: '2026-11-05T00:00:00.000Z',
          dueDateIsDateOnly: true,
        }),
      ),
      row(
        'done',
        buildEvents('2026-11-01T00:00:00Z', DUE, [
          { at: '2026-11-02T00:00:00Z', status: 'DONE' },
        ]),
      ),
    ];
    const summary = await service.assess(
      'ws-1',
      ['no-due', 'overdue', 'done'],
      NOW,
    );
    expect(ai.predictBatch).not.toHaveBeenCalled();
    expect(summary.ineligible).toEqual({
      'no-due-date': 1,
      overdue: 1,
      done: 1,
    });
    expect(prisma.riskAssessment.createMany).not.toHaveBeenCalled();
  });

  it('withdraws an earlier prediction that no longer applies', async () => {
    tasks = [
      row(
        'overdue',
        buildEvents('2026-11-01T00:00:00Z', {
          dueDate: '2026-11-05T00:00:00.000Z',
          dueDateIsDateOnly: true,
        }),
      ),
      row('already-withdrawn', buildEvents('2026-11-01T00:00:00Z', {})),
    ];
    latest = [
      { taskId: 'overdue', riskLevel: 'LOW' },
      { taskId: 'already-withdrawn', riskLevel: 'UNAVAILABLE' },
    ];
    const summary = await service.assess(
      'ws-1',
      ['overdue', 'already-withdrawn'],
      NOW,
    );
    expect(stored()).toEqual([
      expect.objectContaining({
        taskId: 'overdue',
        riskLevel: 'UNAVAILABLE',
        modelVersion: 'none',
        reason: 'overdue',
      }),
    ]);
    expect(summary.withdrawn).toBe(1);
  });

  it('stores nothing new when no model is available, but withdraws stale predictions', async () => {
    tasks = [
      row('t1', buildEvents('2026-11-01T00:00:00Z', DUE)),
      row('t2', buildEvents('2026-11-01T00:00:00Z', DUE)),
    ];
    latest = [{ taskId: 't2', riskLevel: 'MEDIUM' }];
    ai.predictBatch.mockResolvedValue(null);
    const summary = await service.assess('ws-1', ['t1', 't2'], NOW);
    expect(stored()).toEqual([
      expect.objectContaining({
        taskId: 't2',
        riskLevel: 'UNAVAILABLE',
        reason: 'model-unavailable',
      }),
    ]);
    expect(summary).toMatchObject({
      predicted: 0,
      modelUnavailable: true,
      withdrawn: 1,
    });
  });

  it('never uses a model unless an owner or admin enabled training', async () => {
    prisma.workspace.findFirst.mockResolvedValue({
      timezone: 'UTC',
      riskTrainingEnabled: false,
    });
    tasks = [row('t1', buildEvents('2026-11-01T00:00:00Z', DUE))];
    latest = [{ taskId: 't1', riskLevel: 'HIGH' }];
    const summary = await service.assess('ws-1', ['t1'], NOW);
    expect(ai.predictBatch).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ predicted: 0, modelUnavailable: true });
    expect(stored()).toEqual([
      expect.objectContaining({
        taskId: 't1',
        riskLevel: 'UNAVAILABLE',
        reason: 'training-disabled',
      }),
    ]);
  });

  it('sends large workspaces in batches of 200', async () => {
    tasks = Array.from({ length: 450 }, (_, i) =>
      row(`t${i}`, buildEvents('2026-11-01T00:00:00Z', DUE)),
    );
    ai.predictBatch.mockImplementation(
      (_ws: string, items: Array<{ taskId: string }>) =>
        Promise.resolve({
          modelVersion: 'm',
          results: items.map((i) => ({
            taskId: i.taskId,
            riskLevel: 'LOW',
            probability: null,
          })),
        }),
    );
    const summary = await service.assess('ws-1', undefined, NOW);
    expect(
      (ai.predictBatch.mock.calls as Array<[string, unknown[]]>).map(
        ([, items]) => items.length,
      ),
    ).toEqual([200, 200, 50]);
    expect(summary.predicted).toBe(450);
  });

  it('ignores results for tasks that were not requested', async () => {
    tasks = [row('t1', buildEvents('2026-11-01T00:00:00Z', DUE))];
    ai.predictBatch.mockResolvedValue({
      modelVersion: 'm',
      results: [
        {
          taskId: 'other-workspace-task',
          riskLevel: 'HIGH',
          probability: null,
        },
        { taskId: 't1', riskLevel: 'LOW', probability: null },
      ],
    });
    await service.assess('ws-1', ['t1'], NOW);
    expect(stored().map((r) => r.taskId)).toEqual(['t1']);
  });
});
