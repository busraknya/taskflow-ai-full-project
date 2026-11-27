import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { RiskModelController } from './risk-model.controller';
import { RiskModelProcessor } from './risk-model.processor';
import { RISK_MODEL_QUEUE } from './risk-model.queue';
import { RiskModelScheduler } from './risk-model.scheduler';
import { RiskModelService } from './risk-model.service';

@Module({
  imports: [AiModule, BullModule.registerQueue({ name: RISK_MODEL_QUEUE })],
  controllers: [RiskModelController],
  providers: [RiskModelService, RiskModelProcessor, RiskModelScheduler],
})
export class RiskModelModule {}
