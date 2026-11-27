import { ConflictException, NotFoundException } from '@nestjs/common';

// Isolate Nest packages that ship ESM entry points.
jest.mock('@nestjs/event-emitter', () => ({
  EventEmitter2: class EventEmitter2 {},
}));
jest.mock('@nestjs/bullmq', () => ({ InjectQueue: () => () => undefined }));
import type { Queue } from 'bullmq';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { RiskAssessmentJobData } from '../ai/risk-assessment.queue';

describe('TasksService atomic version updates', () => {
  const prisma = {
    task: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    project: { findFirst: jest.fn() },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const riskQueue = { add: jest.fn() };
  const service = new TasksService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    events as unknown as EventEmitter2,
    riskQueue as unknown as Queue<RiskAssessmentJobData>,
  );

  const existingTask = {
    id: 'task-1',
    workspaceId: 'workspace-1',
    version: 4,
    deletedAt: null,
    status: 'TODO',
    assigneeId: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    audit.log.mockResolvedValue(undefined);
    riskQueue.add.mockResolvedValue({});
  });

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
            riskLevel: { not: 'UNAVAILABLE' },
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
      status: 'DONE' as any,
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
});
