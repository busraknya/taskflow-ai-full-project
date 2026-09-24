import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  async process(job: Job<any, any, string>): Promise<any> {
    const { recipient, subject, templateData } = job.data;
    
    console.log(`[EmailWorker] Sending email to ${recipient} with subject: "${subject}"`);
    
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log(`[EmailWorker] Email successfully sent to ${recipient}`);
    return { sent: true };
  }
}