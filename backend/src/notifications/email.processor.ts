import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as nodemailer from 'nodemailer';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  async process(job: Job<any, any, string>): Promise<any> {
    const { recipient, subject, templateData } = job.data;
    
    console.log(`[EmailWorker] Processing email for ${recipient}...`);

    // SMTP Transporter (Alıcının .env'den gireceği ayarlarla çalışır)
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
      port: parseInt(process.env.SMTP_PORT || '2525'),
      auth: {
        user: process.env.SMTP_USER || '',
        pass: process.env.SMTP_PASSWORD || '',
      },
    });

    try {
      // E-posta gönderimi (Master Invariant #8: Asenkron, ana işlemi bloklamaz)
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@taskflow.local',
        to: recipient,
        subject: subject,
        text: `Hello ${templateData.fullName},\n\nYou have been assigned to task: ${templateData.taskTitle}`,
        html: `<p>Hello <b>${templateData.fullName}</b>,</p><p>You have been assigned to task: <b>${templateData.taskTitle}</b></p>`,
      });

      console.log(`[EmailWorker] Email successfully sent to ${recipient}`);
      return { sent: true };
    } catch (error) {
      console.error(`[EmailWorker] Failed to send email to ${recipient}:`, error);
      throw error; // BullMQ otomatik retry mekanizmasını tetikler (Exponential Backoff)
    }
  }
}