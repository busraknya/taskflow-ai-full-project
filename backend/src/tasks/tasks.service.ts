import { Injectable, NotFoundException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AuditService } from '../common/audit/audit.service'; 
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { describeError } from '../common/logging/log-sanitizer';
import { parseDueDateInput } from '../task-events/due-date';
import {
  diffTaskState,
  toEventRows,
  toHistoryState,
} from '../task-events/task-history';
import {
  CURRENT_RISK_ASSESSMENT_INCLUDE,
  enqueueRiskAssessment,
  RISK_ASSESSMENT_QUEUE,
  riskAssessmentJobId,
  RiskQueueJobData,
} from '../ai/risk-assessment.queue';

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private eventEmitter: EventEmitter2,
    @InjectQueue(RISK_ASSESSMENT_QUEUE)
    private riskAssessmentQueue: Queue<RiskQueueJobData>,
  ) {}

  /**
   * Schedules a risk assessment without waiting for it (O-1). The request
   * never blocks on Redis or the ML service; failures are only logged.
   */
  private scheduleRiskAssessment(task: {
    id: string;
    workspaceId: string;
    version: number;
  }): void {
    enqueueRiskAssessment(
      this.riskAssessmentQueue,
      { taskId: task.id, workspaceId: task.workspaceId, taskVersion: task.version },
      riskAssessmentJobId(task.id, task.version),
      (error) => {
        const { summary, stack } = describeError(error);
        this.logger.error(
          `Failed to schedule risk assessment for task ${task.id}: ${summary}`,
          stack,
        );
      },
    );
  }

  async create(workspaceId: string, userId: string, dto: CreateTaskDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, workspaceId, deletedAt: null },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    if (dto.assigneeId) {
      const membership = await this.prisma.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: dto.assigneeId,
          },
        },
      });
      if (!membership || membership.status !== 'ACTIVE') {
        throw new ForbiddenException('The assignee is not a member of this workspace.');
      }
    }

    const due = parseDueDateInput(dto.dueDate || undefined);
    const status = dto.status || 'TODO';
    const now = new Date();

    // The task and its CREATED event are written atomically (TaskEvent).
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          workspaceId,
          projectId: dto.projectId,
          title: dto.title,
          description: dto.description,
          status,
          priority: dto.priority || 0,
          assigneeId: dto.assigneeId,
          dueDate: due?.dueDate ?? undefined,
          dueDateIsDateOnly: due?.dueDateIsDateOnly ?? false,
          completedAt: status === 'DONE' ? now : null,
        },
      });
      await tx.taskEvent.createMany({
        data: toEventRows(
          [
            {
              type: 'CREATED',
              oldValue: null,
              newValue: { ...toHistoryState(created, 0) },
            },
          ],
          { workspaceId, taskId: created.id, actorId: userId, occurredAt: now },
        ),
      });
      return created;
    });

    await this.auditService.log({
      workspaceId,
      actorId: userId,
      entityType: 'TASK',
      entityId: task.id,
      action: 'TASK_CREATED',
      metadata: { title: task.title, status: task.status },
    });

    if (task.assigneeId) {
      this.eventEmitter.emit('task.assigned', {
        taskId: task.id,
        assigneeId: task.assigneeId,
        workspaceId,
        taskVersion: task.version,
      });
    }

    this.scheduleRiskAssessment(task);

    return task;
  }

  async findOneInWorkspace(workspaceId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
      include: {
        assignee: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        riskAssessments: CURRENT_RISK_ASSESSMENT_INCLUDE,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    return task;
  }

  async findAllInWorkspace(workspaceId: string, projectId?: string) {
    return this.prisma.task.findMany({
      where: {
        workspaceId,
        projectId: projectId || undefined,
        deletedAt: null,
      },
      include: {
        assignee: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        riskAssessments: CURRENT_RISK_ASSESSMENT_INCLUDE,
      },
      orderBy: { position: 'asc' },
    });
  }

  async update(workspaceId: string, taskId: string, userId: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    if (task.version !== dto.version) {
      throw new ConflictException({
        code: 'STALE_VERSION',
        message: 'This task has been updated by another user. Please refresh the page.',
        currentVersion: task.version,
      });
    }

    if (dto.assigneeId) {
      const membership = await this.prisma.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: dto.assigneeId,
          },
        },
      });
      if (!membership || membership.status !== 'ACTIVE') {
        throw new ForbiddenException('The assigned user is not a member of this workspace.');
      }
    }

    const due = parseDueDateInput(dto.dueDate);
    const now = new Date();

    // completedAt tracks the last transition to DONE and is cleared on reopen.
    let completedAt: Date | null | undefined;
    if (dto.status !== undefined && dto.status !== task.status) {
      if (dto.status === 'DONE') completedAt = now;
      else if (task.status === 'DONE') completedAt = null;
    }

    // `task` was read at dto.version; if the compare-and-swap below succeeds,
    // these are exactly the values the update replaced.
    const changes = diffTaskState(
      toHistoryState(task, 0),
      toHistoryState(
        {
          status: dto.status ?? task.status,
          priority: dto.priority ?? task.priority,
          assigneeId:
            dto.assigneeId !== undefined ? dto.assigneeId : task.assigneeId,
          dueDate: due ? due.dueDate : task.dueDate,
          dueDateIsDateOnly: due
            ? due.dueDateIsDateOnly
            : task.dueDateIsDateOnly,
          completedAt:
            completedAt !== undefined ? completedAt : task.completedAt,
        },
        0,
      ),
    );

    // Compare-and-swap and the matching TaskEvents commit or roll back together.
    const updated = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.task.updateMany({
        where: {
          id: taskId,
          workspaceId,
          deletedAt: null,
          version: dto.version,
        },
        data: {
          title: dto.title,
          description: dto.description,
          status: dto.status,
          priority: dto.priority,
          assigneeId: dto.assigneeId,
          dueDate: due ? due.dueDate : undefined,
          dueDateIsDateOnly: due ? due.dueDateIsDateOnly : undefined,
          completedAt,
          position: dto.position,
          version: { increment: 1 },
        },
      });
      if (updateResult.count !== 1) {
        return false;
      }
      if (changes.length > 0) {
        await tx.taskEvent.createMany({
          data: toEventRows(changes, {
            workspaceId,
            taskId,
            actorId: userId,
            occurredAt: now,
            clientOccurredAt: dto.clientOccurredAt
              ? new Date(dto.clientOccurredAt)
              : null,
          }),
        });
      }
      return true;
    });

    if (!updated) {
      const currentTask = await this.prisma.task.findFirst({
        where: { id: taskId, workspaceId, deletedAt: null },
        select: { version: true },
      });

      if (!currentTask) {
        throw new NotFoundException('Task not found.');
      }

      throw new ConflictException({
        code: 'STALE_VERSION',
        message: 'This task has been updated by another user. Please refresh the page.',
        currentVersion: currentTask.version,
      });
    }

    const updatedTask = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
      include: {
        assignee: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        riskAssessments: CURRENT_RISK_ASSESSMENT_INCLUDE,
      },
    });

    if (!updatedTask) {
      throw new NotFoundException('Task not found.');
    }

    await this.auditService.log({
      workspaceId,
      actorId: userId,
      entityType: 'TASK',
      entityId: updatedTask.id,
      action: 'TASK_UPDATED',
      metadata: { title: updatedTask.title, status: updatedTask.status, version: updatedTask.version },
    });

    if (updatedTask.assigneeId && updatedTask.assigneeId !== task.assigneeId) {
      this.eventEmitter.emit('task.assigned', {
        taskId: updatedTask.id,
        assigneeId: updatedTask.assigneeId,
        workspaceId,
        taskVersion: updatedTask.version,
      });
    }

    this.scheduleRiskAssessment(updatedTask);

    return updatedTask;
  }
}