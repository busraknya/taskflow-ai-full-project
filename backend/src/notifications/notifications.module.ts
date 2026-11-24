import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailProcessor } from './email.processor';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email',
      defaultJobOptions: {
        // Retry transient SMTP failures with bounded exponential backoff.
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 5_000,
        },
        removeOnComplete: {
          age: 24 * 60 * 60,
          count: 1_000,
        },
        // Keep failed jobs available for diagnosis for up to one week.
        removeOnFail: {
          age: 7 * 24 * 60 * 60,
          count: 5_000,
        },
      },
    }),
  ],
  providers: [EmailProcessor],
  exports: [BullModule],
})
export class NotificationsModule {}
