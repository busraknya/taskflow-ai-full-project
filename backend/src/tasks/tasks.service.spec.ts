import { ConflictException, NotFoundException } from '@nestjs/common';

// Isolate Nest packages that ship ESM entry points.
jest.mock('@nestjs/event-emitter', () => ({
  EventEmitter2: class EventEmitter2 {},
}));
jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => undefined }));
import type { Queue } from 'bullmq';
import { TaskStatus } from '@prisma/client';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { RiskQueueJobData } from '../ai/risk-assessment.queue';

describe('TasksService atomic version updates', () => {
  const prisma = {
    task: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    project: { findFirst: jest.fn() },
    workspaceMembership: {
      findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }),
    },
    taskEvent: { createMany: jest.fn() },
    $transaction: jest.fn(),
  };
  // Interactive transactions run the callback with the same client mock.
  prisma.$transaction.mockImplementation(
    (callback: (tx: typeof prisma) => unknown) => callback(prisma),
  );
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const riskQueue = { add: jest.fn() };
  const service = new TasksService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    events as unknown as EventEmitter2,
    riskQueue as unknown as Queue<RiskQueueJobData>,
  );

  const existingTask = {
    id: 'task-1',
    workspaceId: 'workspace-1',
    version: 4,
    deletedAt: null,
    status: 'TODO',
    priority: 1,
    assigneeId: null,
    dueDate: null,
    dueDateIsDateOnly: false,
    completedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Drop queued once-values so a failing test cannot leak into the next.
    prisma.task.findFirst.mockReset();
    prisma.task.updateMany.mockReset();
    audit.log.mockResolvedValue(undefined);
    riskQueue.add.mockResolvedValue({});
    prisma.taskEvent.createMany.mockResolvedValue({ count: 1 });
  });

  const eventRows = () =>
    (
      prisma.taskEvent.createMany.mock.calls as Array<[{ data: unknown[] }]>
    ).flatMap(([arg]) => arg.data) as Array<Record<string, unknown>>;

  function mockSuccessfulUpdate(updated: Record<string, unknown> = {}) {
    prisma.task.findFirst
      .mockResolvedValueOnce(existingTask)
      .mockResolvedValueOnce({ ...existingTask, version: 5, ...updated });
    prisma.task.updateMany.mockResolvedValue({ count: 1 });
  }

  it('loads task details only within the requested workspace', async () => {
    const task = {
      ...existingTask,
      assignee: null,
      riskAssessments: [],
    };
    prisma.task.findFirst.mockResolvedValue(task);

    await expect(
      service.findOneInWorkspace('workspace-1', 'task-1'),
    ).resolves.toEqual(task);

    expect(prisma.task.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'task-1',
        workspaceId: 'workspace-1',
        deletedAt: null,
      },
      include: {
        assignee: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        // Assessments from the retired demo model (v1) and legacy
        // UNAVAILABLE placeholders are never returned.
        riskAssessments: {
          where: {
            modelVersion: { notIn: ['v1'] },
          },
          orderBy: { computedAt: 'desc' },
          take: 1,
        },
      },
    });
  });

  it('returns not found when the task is outside the workspace or deleted', async () => {
    prisma.task.findFirst.mockResolvedValue(null);

    await expect(
      service.findOneInWorkspace('workspace-1', 'task-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses a single conditional database update to compare and increment the version', async () => {
    const updatedTask = {
      ...existingTask,
      version: 5,
      status: 'DONE',
      assignee: null,
      riskAssessments: [],
    };
    prisma.task.findFirst
      .mockResolvedValueOnce(existingTask)
      .mockResolvedValueOnce(updatedTask);
    prisma.task.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.update('workspace-1', 'task-1', 'user-1', {
      version: 4,
      status: TaskStatus.DONE,
    });

    expect(prisma.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'task-1',
          workspaceId: 'workspace-1',
          deletedAt: null,
          version: 4,
        },
        data: expect.objectContaining({
          version: { increment: 1 },
        }),
      }),
    );
    expect(result.version).toBe(5);
    expect(audit.log).toHaveBeenCalledTimes(1);
  });

  it('returns a stale-version conflict when another update wins the race', async () => {
    prisma.task.findFirst
      .mockResolvedValueOnce(existingTask)
      .mockResolvedValueOnce({ version: 5 });
    prisma.task.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('workspace-1', 'task-1', 'user-1', {
        version: 4,
        title: 'Concurrent edit',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(audit.log).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('returns not found when the task disappears before the conditional update', async () => {
    prisma.task.findFirst
      .mockResolvedValueOnce(existingTask)
      .mockResolvedValueOnce(null);
    prisma.task.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('workspace-1', 'task-1', 'user-1', { version: 4 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('asynchronous risk assessment (O-1)', () => {
    it('schedules an assessment for the new version after an update', async () => {
      prisma.task.findFirst
        .mockResolvedValueOnce(existingTask)
        .mockResolvedValueOnce({ ...existingTask, version: 5 });
      prisma.task.updateMany.mockResolvedValue({ count: 1 });

      await service.update('workspace-1', 'task-1', 'user-1', { version: 4 });

      expect(riskQueue.add).toHaveBeenCalledWith(
        'assess-task',
        { taskId: 'task-1', workspaceId: 'workspace-1', taskVersion: 5 },
        expect.objectContaining({
          jobId: 'task-task-1-v5',
          delay: 2_000,
          attempts: 3,
        }),
      );
    });

    it('schedules an assessment when a task is created', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'project-1' });
      prisma.task.create.mockResolvedValue({
        ...existingTask,
        version: 0,
        title: 'New task',
      });

      await service.create('workspace-1', 'user-1', {
        title: 'New task',
        projectId: 'project-1',
      });

      expect(riskQueue.add).toHaveBeenCalledWith(
        'assess-task',
        { taskId: 'task-1', workspaceId: 'workspace-1', taskVersion: 0 },
        expect.objectContaining({ jobId: 'task-task-1-v0' }),
      );
    });

    it('does not wait for the queue, so a slow or unavailable Redis never blocks the request', async () => {
      riskQueue.add.mockReturnValue(new Promise(() => undefined));
      prisma.task.findFirst
        .mockResolvedValueOnce(existingTask)
        .mockResolvedValueOnce({ ...existingTask, version: 5 });
      prisma.task.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.update('workspace-1', 'task-1', 'user-1', { version: 4 }),
      ).resolves.toMatchObject({ version: 5 });
    });

    it('still completes the request when scheduling fails', async () => {
      riskQueue.add.mockRejectedValue(new Error('Redis unavailable'));
      prisma.task.findFirst
        .mockResolvedValueOnce(existingTask)
        .mockResolvedValueOnce({ ...existingTask, version: 5 });
      prisma.task.updateMany.mockResolvedValue({ count: 1 });

      await expect(
        service.update('workspace-1', 'task-1', 'user-1', { version: 4 }),
      ).resolves.toMatchObject({ version: 5 });
      await new Promise((resolve) => setImmediate(resolve));
    });

    it('does not schedule anything when the update conflicts', async () => {
      prisma.task.findFirst.mockResolvedValueOnce(existingTask);

      await expect(
        service.update('workspace-1', 'task-1', 'user-1', { version: 3 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(riskQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('TaskEvent history (ML stage 1)', () => {
    it('records one event per changed field in the same transaction as the update', async () => {
      mockSuccessfulUpdate();

      await service.update('workspace-1', 'task-1', 'user-1', {
        version: 4,
        status: TaskStatus.IN_PROGRESS,
        priority: 3,
        dueDate: '2026-12-01',
        assigneeId: '3f0c7e7e-5d7a-4a43-9a6b-2f4b0f7b8c11',
        title: 'Renamed only',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const rows = eventRows();
      expect(rows.map((row) => row.type)).toEqual([
        'STATUS_CHANGED',
        'DUE_DATE_CHANGED',
        'ASSIGNEE_CHANGED',
        'PRIORITY_CHANGED',
      ]);
      expect(rows[1]).toMatchObject({
        oldValue: { dueDate: null, dueDateIsDateOnly: false },
        newValue: {
          dueDate: '2026-12-01T00:00:00.000Z',
          dueDateIsDateOnly: true,
        },
      });
      for (const row of rows) {
        expect(row).toMatchObject({
          workspaceId: 'workspace-1',
          taskId: 'task-1',
          actorId: 'user-1',
          source: 'API',
        });
      }
      // All events of one update share the same server timestamp.
      expect(new Set(rows.map((row) => String(row.occurredAt))).size).toBe(1);
    });

    it('records no event when no tracked field changes', async () => {
      mockSuccessfulUpdate();
      await service.update('workspace-1', 'task-1', 'user-1', {
        version: 4,
        title: 'Only the title',
        status: TaskStatus.TODO,
      });
      expect(prisma.taskEvent.createMany).not.toHaveBeenCalled();
    });

    it('sets completedAt on the transition to DONE and clears it on reopen', async () => {
      mockSuccessfulUpdate();
      await service.update('workspace-1', 'task-1', 'user-1', {
        version: 4,
        status: TaskStatus.DONE,
      });
      const doneData = (
        prisma.task.updateMany.mock.calls[0] as [
          { data: { completedAt: Date } },
        ]
      )[0].data;
      expect(doneData.completedAt).toBeInstanceOf(Date);
      expect(eventRows()[0].occurredAt).toEqual(doneData.completedAt);

      jest.clearAllMocks();
      prisma.taskEvent.createMany.mockResolvedValue({ count: 1 });
      prisma.task.findFirst
        .mockResolvedValueOnce({
          ...existingTask,
          status: 'DONE',
          completedAt: new Date('2026-11-01T10:00:00.000Z'),
        })
        .mockResolvedValueOnce({ ...existingTask, version: 5 });
      prisma.task.updateMany.mockResolvedValue({ count: 1 });
      await service.update('workspace-1', 'task-1', 'user-1', {
        version: 4,
        status: TaskStatus.IN_PROGRESS,
      });
      const reopenData = (
        prisma.task.updateMany.mock.calls[0] as [
          { data: { completedAt: null } },
        ]
      )[0].data;
      expect(reopenData.completedAt).toBeNull();
    });

    it('stores an explicit-time due date as an exact instant', async () => {
      mockSuccessfulUpdate();
      await service.update('workspace-1', 'task-1', 'user-1', {
        version: 4,
        dueDate: '2026-12-01T15:30:00.000Z',
      });
      expect(eventRows()[0]).toMatchObject({
        newValue: {
          dueDate: '2026-12-01T15:30:00.000Z',
          dueDateIsDateOnly: false,
        },
      });
    });

    it('marks changes reported with a client timestamp as offline sync', async () => {
      mockSuccessfulUpdate();
      await service.update('workspace-1', 'task-1', 'user-1', {
        version: 4,
        status: TaskStatus.IN_REVIEW,
        clientOccurredAt: '2026-11-27T08:00:00.000Z',
      });
      expect(eventRows()[0]).toMatchObject({
        source: 'OFFLINE_SYNC',
        clientOccurredAt: new Date('2026-11-27T08:00:00.000Z'),
      });
    });

    it('writes no event when the compare-and-swap loses', async () => {
      prisma.task.findFirst
        .mockResolvedValueOnce(existingTask)
        .mockResolvedValueOnce({ version: 5 });
      prisma.task.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.update('workspace-1', 'task-1', 'user-1', {
          version: 4,
          status: TaskStatus.DONE,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.taskEvent.createMany).not.toHaveBeenCalled();
    });

    it('records a CREATED event with the initial state', async () => {
      prisma.project.findFirst.mockResolvedValue({ id: 'project-1' });
      prisma.task.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => ({
          ...existingTask,
          ...data,
          id: 'task-1',
          version: 0,
        }),
      );

      await service.create('workspace-1', 'user-1', {
        title: 'New',
        projectId: 'project-1',
        priority: 2,
        dueDate: '2026-12-24',
      });

      expect(eventRows()).toEqual([
        expect.objectContaining({
          type: 'CREATED',
          workspaceId: 'workspace-1',
          taskId: 'task-1',
          newValue: {
            status: 'TODO',
            priority: 2,
            assigneeId: null,
            dueDate: '2026-12-24T00:00:00.000Z',
            dueDateIsDateOnly: true,
            completedAt: null,
            commentCount: 0,
          },
        }),
      ]);
    });
  });
});
