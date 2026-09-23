import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  async create(workspaceId: string, dto: CreateTaskDto) {
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

    return this.prisma.task.create({
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
      },
      orderBy: { position: 'asc' },
    });
  }

  async update(workspaceId: string, taskId: string, dto: UpdateTaskDto) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, workspaceId, deletedAt: null },
    });

    if (!task) {
      throw new NotFoundException('Görev bulunamadı.');
    }

    if (task.version !== dto.version) {
      throw new ConflictException({
        code: 'STALE_VERSION',
        message: 'Bu görev başka bir kullanıcı tarafından güncellendi. Lütfen sayfayı yenileyin.',
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
        throw new ForbiddenException('Atanan kullanıcı bu workspace\'in üyesi değil.');
      }
    }

    return this.prisma.task.update({
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
      },
    });
  }
}