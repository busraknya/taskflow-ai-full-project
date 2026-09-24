import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TaskAssignedListener {
  constructor(
    @InjectQueue('email') private emailQueue: Queue,
    private prisma: PrismaService,
  ) {}

  @OnEvent('task.assigned')
  async handleTaskAssignedEvent(payload: { taskId: string; assigneeId: string; workspaceId: string }) {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.assigneeId },
      });

      const task = await this.prisma.task.findUnique({
        where: { id: payload.taskId },
      });

      if (!user || !task) return;

      let pref = await this.prisma.notificationPreference.findUnique({
        where: {
          userId_category: {
            userId: user.id,
            category: 'task.assigned',
          },
        },
      });

      const emailEnabled = pref ? pref.emailEnabled : true;

      if (!emailEnabled) {
        console.log(`[Notification] Email skipped for user ${user.email} due to preferences.`);
        return;
      }

      await this.emailQueue.add('send-email', {
        recipient: user.email,
        subject: `New Task Assigned: ${task.title}`,
        templateData: {
          fullName: user.fullName,
          taskTitle: task.title,
          taskId: task.id,
        },
      });

      console.log(`[Notification] Task assigned email enqueued for ${user.email}`);
    } catch (error) {
      console.error('[Notification] Failed to handle task.assigned event:', error);
    }
  }
}