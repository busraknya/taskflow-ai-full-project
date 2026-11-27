import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { describeError } from '../../common/logging/log-sanitizer';

@Injectable()
export class TaskAssignedListener {
  private readonly logger = new Logger(TaskAssignedListener.name);

  constructor(
    @InjectQueue('email') private emailQueue: Queue,
    private prisma: PrismaService,
  ) {}

  @OnEvent('task.assigned')
  async handleTaskAssignedEvent(payload: { taskId: string; assigneeId: string; workspaceId: string; taskVersion: number }) {
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
        this.logger.log(
          `Task-assigned email skipped for user ${user.id} (disabled in preferences).`,
        );
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
      }, {
        jobId: `task-assigned-${payload.taskId}-${payload.taskVersion}`,
      });

      this.logger.log(`Task-assigned email enqueued for user ${user.id}.`);
    } catch (error) {
      const { summary, stack } = describeError(error);
      this.logger.error(
        `Failed to handle task.assigned event for task ${payload.taskId}: ${summary}`,
        stack,
      );
    }
  }
}