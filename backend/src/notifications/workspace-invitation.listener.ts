import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { describeError } from '../common/logging/log-sanitizer';
import {
  INVITATION_CREATED_EVENT,
  type InvitationCreatedEvent,
} from '../workspaces/invitations.service';
import {
  isEmailDeliveryEnabled,
  warnEmailDisabledOnce,
} from './mail-transport';

@Injectable()
export class WorkspaceInvitationListener {
  private readonly logger = new Logger(WorkspaceInvitationListener.name);

  constructor(@InjectQueue('email') private readonly emailQueue: Queue) {}

  @OnEvent(INVITATION_CREATED_EVENT)
  async handleInvitationCreated(
    payload: InvitationCreatedEvent,
  ): Promise<void> {
    if (!isEmailDeliveryEnabled()) {
      // The inviter receives the link in the API response instead.
      warnEmailDisabledOnce();
      return;
    }
    try {
      await this.emailQueue.add(
        'send-email',
        {
          recipient: payload.email,
          subject: `You were invited to ${payload.workspaceName} on TaskFlow AI`,
          templateData: {
            type: 'workspace-invitation',
            inviterName: payload.inviterName,
            workspaceName: payload.workspaceName,
            expiresAt: payload.expiresAt.toISOString(),
            acceptUrl: payload.acceptUrl,
          },
        },
        {
          // One email per issued link (a resend issues a new link).
          jobId: `workspace-invitation-${payload.invitationId}-${payload.expiresAt.getTime()}`,
          // The job carries the secret link: keep it in Redis only briefly.
          removeOnComplete: true,
          removeOnFail: { age: 24 * 60 * 60 },
        },
      );
    } catch (error) {
      const { summary, stack } = describeError(error);
      this.logger.error(
        `Failed to enqueue invitation email for invitation ${payload.invitationId}: ${summary}`,
        stack,
      );
    }
  }
}
