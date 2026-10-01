import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { AuditService } from '../common/audit/audit.service';

@Injectable()
export class CommentsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(workspaceId: string, taskId: string, userId: string, dto: CreateCommentDto) {
    // 1. Task'ın bu workspace'e ait olduğunu doğrula (Tenant Sınırı)
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Görev bulunamadı.');
    }

    // 2. Yorumu oluştur
    const comment = await this.prisma.comment.create({
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

    // 3. Audit Log kaydı
    await this.auditService.log({
      workspaceId,
      actorId: userId,
      entityType: 'COMMENT',
      entityId: comment.id,
      action: 'COMMENT_CREATED',
      metadata: { taskId, bodySnippet: comment.body.substring(0, 30) },
    });

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

    // 3. Soft delete (Domain Rules §1)
    return this.prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
  }
}