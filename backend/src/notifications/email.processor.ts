import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';
import { escapeHtml } from './email-template.util';

type TaskAssignedTemplateData = {
  type?: 'task-assigned';
  fullName: string;
  taskTitle: string;
  taskId: string;
};

type WorkspaceInvitationTemplateData = {
  type: 'workspace-invitation';
  fullName: string;
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
  async process(job: Job<EmailJobData>): Promise<{ sent: true }> {
    const { recipient, subject, templateData } = job.data;
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
      port: Number.parseInt(process.env.SMTP_PORT || '2525', 10),
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || '',
      },
    });

    let text: string;
    let html: string;

    if (templateData.type === 'workspace-invitation') {
      const expiresAt = new Date(templateData.expiresAt).toLocaleString();
      text = [
        `Hello ${templateData.fullName},`,
        `You were invited to join ${templateData.workspaceName} on TaskFlow AI.`,
        `Sign in to accept the invitation: ${templateData.acceptUrl}`,
        `This invitation expires on ${expiresAt}.`,
      ].join('\n\n');
      html = [
        `<p>Hello <b>${escapeHtml(templateData.fullName)}</b>,</p>`,
        `<p>You were invited to join <b>${escapeHtml(templateData.workspaceName)}</b> on TaskFlow AI.</p>`,
        `<p><a href="${escapeHtml(templateData.acceptUrl)}">Sign in to accept the invitation</a></p>`,
        `<p>This invitation expires on ${escapeHtml(expiresAt)}.</p>`,
      ].join('');
    } else {
      text = `Hello ${templateData.fullName},\n\nYou have been assigned to task: ${templateData.taskTitle}`;
      html = `<p>Hello <b>${escapeHtml(templateData.fullName)}</b>,</p><p>You have been assigned to task: <b>${escapeHtml(templateData.taskTitle)}</b></p>`;
    }

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@taskflow.local',
        to: recipient,
        subject,
        text,
        html,
      });
      console.log(`[EmailWorker] Email successfully sent to ${recipient}`);
      return { sent: true };
    } catch (error) {
      console.error(
        `[EmailWorker] Failed to send email to ${recipient}:`,
        error,
      );
      throw error;
    }
  }
}
