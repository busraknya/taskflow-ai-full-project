import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AuditService } from '../common/audit/audit.service'; 
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AiService } from '../ai/ai.service';
import { RiskFeatureService } from '../ai/risk-feature.service';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private eventEmitter: EventEmitter2,
    private aiService: AiService,
    private riskFeatureService: RiskFeatureService,
  ) {}

  private async assessAndSaveRisk(taskId: string, workspaceId: string, status: string) {
    if (status === 'DONE') return;

    try {
      const features = await this.riskFeatureService.extractFeaturesForTask(taskId);
      if (!features) return;

      const prediction = await this.aiService.assessTaskRisk(features);

      await this.prisma.riskAssessment.create({
        data: {
          taskId,
          riskLevel: prediction.risk_level as any,
          riskScore: prediction.risk_score,
          factors: prediction.factors,
          modelVersion: prediction.model_version,
        },
      });
    } catch (error) {
      console.error('[AI Risk] Failed to assess task risk:', error);
    }
  }

  async create(workspaceId: string, userId: string, dto: CreateTaskDto) {
    const project = await this.prisma.project.findFirst({
      where: { id: dto.projectId, workspaceId },
    });

    if (!project) {
      throw new NotFoundException('Proje bulunamadı.');
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
        throw new ForbiddenException('Atanan kullanıcı bu workspace\'in üyesi değil.');
      }
    }

    const task = await this.prisma.task.create({
      data: {
        workspaceId,
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        status: dto.status || 'TODO',
        priority: dto.priority || 0,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
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
      });
    }

    // AI Risk Değerlendirmesini Tetikle
    await this.assessAndSaveRisk(task.id, workspaceId, task.status);

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
        riskAssessments: {
          orderBy: { computedAt: 'desc' },
          take: 1,
        },
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

    const updatedTask = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        priority: dto.priority,
        assigneeId: dto.assigneeId,
        dueDate: dto.dueDate !== undefined ? (dto.dueDate ? new Date(dto.dueDate) : null) : undefined,
        position: dto.position,
        version: { increment: 1 }, 
      },
      include: {
        assignee: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
        riskAssessments: {
          orderBy: { computedAt: 'desc' },
          take: 1,
        },
      },
    });

    await this.auditService.log({
      workspaceId,
      actorId: userId,
      entityType: 'TASK',
      entityId: updatedTask.id,
      action: 'TASK_UPDATED',
      metadata: { title: updatedTask.title, status: updatedTask.status, version: updatedTask.version },
    });

    if (updatedTask.assigneeId) {
      this.eventEmitter.emit('task.assigned', {
        taskId: updatedTask.id,
        assigneeId: updatedTask.assigneeId,
        workspaceId,
      });
    }

    await this.assessAndSaveRisk(updatedTask.id, workspaceId, updatedTask.status);

    return updatedTask;
  }
}