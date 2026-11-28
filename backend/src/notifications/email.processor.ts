import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  escapeHtml,
  safeHttpUrl,
  sanitizeHeaderText,
} from './email-template.util';
import { describeError, maskEmail } from '../common/logging/log-sanitizer';
import { createMailTransport, warnEmailDisabledOnce } from './mail-transport';

type TaskAssignedTemplateData = {
  type?: 'task-assigned';
  fullName: string;
  taskTitle: string;
  taskId: string;
};

type WorkspaceInvitationTemplateData = {
  type: 'workspace-invitation';
  /** Unknown for addresses without an account. */
  fullName?: string | null;
  inviterName?: string | null;
  workspaceName: string;
  expiresAt: string;
  acceptUrl: string;
};

type EmailJobData = {
  recipient: string;
  subject: string;
  templateData: TaskAssignedTemplateData | WorkspaceInvitationTemplateData;
};

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  async process(job: Job<EmailJobData>): Promise<{ sent: boolean }> {
    const { recipient, subject, templateData } = job.data;
    const transporter = createMailTransport();
    if (!transporter) {
      // Email is disabled (no SMTP_HOST): never contact any mail server.
      warnEmailDisabledOnce();
      return { sent: false };
    }

    let text: string;
    let html: string;

    if (templateData.type === 'workspace-invitation') {
      const expiresAt = new Date(templateData.expiresAt).toLocaleString();
      // URLs are validated (http/https only) before HTML-escaping; escaping
      // alone would still allow e.g. javascript: links.
      const acceptUrl = safeHttpUrl(templateData.acceptUrl);
      const inviter = templateData.inviterName?.trim();
      const invitedBy = inviter ? `${inviter} invited you` : 'You were invited';
      text = [
        templateData.fullName ? `Hello ${templateData.fullName},` : 'Hello,',
        `${invitedBy} to join ${templateData.workspaceName} on TaskFlow AI.`,
        acceptUrl
          ? `Open this link to accept (you can create an account there if you do not have one): ${acceptUrl}`
          : 'Ask the person who invited you for a new invitation link.',
        `This invitation expires on ${expiresAt}. If you did not expect it, you can ignore this email.`,
      ].join('\n\n');
      html = [
        templateData.fullName
          ? `<p>Hello <b>${escapeHtml(templateData.fullName)}</b>,</p>`
          : '<p>Hello,</p>',
        inviter
          ? `<p><b>${escapeHtml(inviter)}</b> invited you to join <b>${escapeHtml(templateData.workspaceName)}</b> on TaskFlow AI.</p>`
          : `<p>You were invited to join <b>${escapeHtml(templateData.workspaceName)}</b> on TaskFlow AI.</p>`,
        acceptUrl
          ? `<p><a href="${escapeHtml(acceptUrl)}">Accept the invitation</a> (you can create an account there if you do not have one).</p>`
          : '<p>Ask the person who invited you for a new invitation link.</p>',
        `<p>This invitation expires on ${escapeHtml(expiresAt)}. If you did not expect it, you can ignore this email.</p>`,
      ].join('');
    } else {
      text = `Hello ${templateData.fullName},\n\nYou have been assigned to task: ${templateData.taskTitle}`;
      html = `<p>Hello <b>${escapeHtml(templateData.fullName)}</b>,</p><p>You have been assigned to task: <b>${escapeHtml(templateData.taskTitle)}</b></p>`;
    }

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@taskflow.local',
        to: recipient,
        // Subjects embed user-controlled names (workspace, task title).
        subject: sanitizeHeaderText(subject),
        text,
        html,
      });
      this.logger.log(`Email sent to ${maskEmail(recipient)}.`);
      return { sent: true };
    } catch (error) {
      // SMTP replies can echo the recipient; describeError masks addresses.
      const { summary, stack } = describeError(error);
      this.logger.error(
        `Failed to send email to ${maskEmail(recipient)}: ${summary}`,
        stack,
      );
      throw error;
    }
  }
}
