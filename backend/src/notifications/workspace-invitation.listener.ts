import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

type WorkspaceInvitationEvent = {
  workspaceId: string;
  userId: string;
  email: string;
  fullName: string;
  workspaceName: string;
  expiresAt: Date;
};

@Injectable()
export class WorkspaceInvitationListener {
  constructor(@InjectQueue('email') private readonly emailQueue: Queue) {}

  @OnEvent('workspace.member_invited')
  async handleWorkspaceInvitation(
    payload: WorkspaceInvitationEvent,
  ): Promise<void> {
    const frontendUrl = (
      process.env.FRONTEND_URL || 'http://localhost:3000'
    ).replace(/\/+$/, '');
    const acceptUrl = `${frontendUrl}/workspaces`;

    try {
      await this.emailQueue.add(
        'send-email',
        {
          recipient: payload.email,
          subject: `You were invited to ${payload.workspaceName} on TaskFlow AI`,
          templateData: {
            type: 'workspace-invitation',
            fullName: payload.fullName,
            workspaceName: payload.workspaceName,
            expiresAt: payload.expiresAt.toISOString(),
            acceptUrl,
          },
        },
        {
          jobId: `workspace-invitation-${payload.workspaceId}-${payload.userId}-${payload.expiresAt.getTime()}`,
        },
      );
    } catch (error) {
      console.error(
        '[Notification] Failed to enqueue workspace invitation email:',
        error,
      );
    }
  }
}
