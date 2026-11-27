import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { describeError } from '../common/logging/log-sanitizer';
import {
  enqueueRiskAssessment,
  RISK_ASSESSMENT_QUEUE,
  RiskQueueJobData,
} from '../ai/risk-assessment.queue';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { AuditService } from '../common/audit/audit.service';
import { toEventRows } from '../task-events/task-history';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    @InjectQueue(RISK_ASSESSMENT_QUEUE)
    private riskAssessmentQueue: Queue<RiskQueueJobData>,
  ) {}

  /** Comment activity is a risk feature; reassess without waiting (O-1). */
  private scheduleRiskAssessment(
    task: { id: string; workspaceId: string; version: number },
    commentEventKey: string,
  ): void {
    enqueueRiskAssessment(
      this.riskAssessmentQueue,
      { taskId: task.id, workspaceId: task.workspaceId, taskVersion: task.version },
      `task-${task.id}-v${task.version}-${commentEventKey}`,
      (error) => {
        const { summary, stack } = describeError(error);
        this.logger.error(
          `Failed to schedule risk assessment for task ${task.id}: ${summary}`,
          stack,
        );
      },
    );
  }

  async create(workspaceId: string, taskId: string, userId: string, dto: CreateCommentDto) {
    // 1. Task'ın bu workspace'e ait olduğunu doğrula (Tenant Sınırı)
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Görev bulunamadı.');
    }

    // 2. Create the comment and its TaskEvent atomically.
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: {
          taskId,
          authorId: userId,
          body: dto.body,
        },
        include: {
          author: {
            select: { id: true, fullName: true, avatarUrl: true },
          },
        },
      });
      await tx.taskEvent.createMany({
        data: toEventRows(
          [
            {
              type: 'COMMENT_ADDED',
              oldValue: null,
              newValue: { commentId: created.id },
            },
          ],
          {
            workspaceId,
            taskId,
            actorId: userId,
            occurredAt: created.createdAt,
          },
        ),
      });
      return created;
    });

    // 3. Audit Log kaydı
    await this.auditService.log({
      workspaceId,
      actorId: userId,
      entityType: 'COMMENT',
      entityId: comment.id,
      action: 'COMMENT_CREATED',
      metadata: { taskId, bodySnippet: comment.body.substring(0, 30) },
    });
    this.scheduleRiskAssessment(task, `comment-${comment.id}-added`);

    return comment;
  }

  async findAllForTask(workspaceId: string, taskId: string) {
    // Task'ın bu workspace'e ait olduğunu doğrula
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Görev bulunamadı.');
    }

    return this.prisma.comment.findMany({
      where: { taskId, deletedAt: null },
      include: {
        author: {
          select: { id: true, fullName: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async remove(workspaceId: string, taskId: string, userId: string, commentId: string) {
    // 1. Task ve yorumun var olduğunu doğrula
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, taskId, deletedAt: null },
      include: { task: true },
    });

    if (!comment || comment.task.workspaceId !== workspaceId) {
      throw new NotFoundException('Yorum bulunamadı.');
    }

    // 2. Kullanıcının rolünü al (OWNER/ADMIN mi?)
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });

    const isAdminOrOwner = membership && (membership.role === 'OWNER' || membership.role === 'ADMIN');
    const isAuthor = comment.authorId === userId;

    // Domain Rules §7 & D-6: Sadece yazar veya ADMIN/OWNER silebilir!
    if (!isAuthor && !isAdminOrOwner) {
      throw new ForbiddenException('Bu yorumu silme yetkiniz yok.');
    }

    // 3. Soft delete (Domain Rules §1). The conditional update ensures a
    // concurrent delete records exactly one COMMENT_DELETED event.
    const deletedAt = new Date();
    const deleted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.comment.updateMany({
        where: { id: commentId, taskId, deletedAt: null },
        data: { deletedAt },
      });
      if (result.count !== 1) {
        throw new NotFoundException('Yorum bulunamadı.');
      }
      await tx.taskEvent.createMany({
        data: toEventRows(
          [
            {
              type: 'COMMENT_DELETED',
              oldValue: { commentId },
              newValue: null,
            },
          ],
          { workspaceId, taskId, actorId: userId, occurredAt: deletedAt },
        ),
      });
      return tx.comment.findUniqueOrThrow({ where: { id: commentId } });
    });
    this.scheduleRiskAssessment(comment.task, `comment-${commentId}-deleted`);
    return deleted;
  }
}