import { ConflictException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AiService } from '../ai/ai.service';
import { RiskFeatureService } from '../ai/risk-feature.service';

describe('TasksService atomic version updates', () => {
  const prisma = {
    task: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const events = { emit: jest.fn() };
  const ai = {};
  const riskFeatures = {};
  const service = new TasksService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
    events as unknown as EventEmitter2,
    ai as unknown as AiService,
    riskFeatures as unknown as RiskFeatureService,
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
});
