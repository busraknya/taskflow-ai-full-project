import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RiskFeatureService {
  constructor(private prisma: PrismaService) {}

  async extractFeaturesForTask(taskId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: {
        comments: true,
      },
    });

    if (!task) return null;

    // 1. days_until_due (Bitiş tarihine kalan gün)
    let daysUntilDue = 7; // Varsayılan
    if (task.dueDate) {
      const now = new Date();
      const due = new Date(task.dueDate);
      const diffTime = due.getTime() - now.getTime();
      daysUntilDue = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // 2. assignee_active_task_count (Assignee'nin aktif görev sayısı)
    let activeTaskCount = 0;
    if (task.assigneeId) {
      activeTaskCount = await this.prisma.task.count({
        where: {
          assigneeId: task.assigneeId,
          status: { not: 'DONE' },
          deletedAt: null,
        },
      });
    }

    // 3. comment_count (Yorum sayısı)
    const commentCount = task.comments.length;

    // 4. priority (Öncelik 0-3)
    const priority = task.priority;

    return {
      days_until_due: daysUntilDue,
      assignee_active_task_count: activeTaskCount,
      comment_count: commentCount,
      priority: priority,
    };
  }
}