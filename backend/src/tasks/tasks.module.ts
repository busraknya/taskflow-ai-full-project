import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { BullModule } from '@nestjs/bullmq';
import { TaskAssignedListener } from './events/task-assigned.listener';
import { AiModule } from 'src/ai/ai.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'email',
    }),
    AiModule,
  ],
  controllers: [TasksController],
  providers: [TasksService]
})
export class TasksModule {}
