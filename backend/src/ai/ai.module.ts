import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { HttpModule } from '@nestjs/axios';
import { BullModule } from '@nestjs/bullmq';
import { RiskInferenceService } from './risk-inference.service';
import { RiskRecomputeScheduler } from './risk-recompute.scheduler';
import { RiskAssessmentProcessor } from './risk-assessment.processor';
import { RISK_ASSESSMENT_QUEUE } from './risk-assessment.queue';

@Module({
  imports: [
    // ML inference is optional to the core task workflow. Bound its latency so
    // an unavailable or stalled model cannot hold API requests indefinitely.
    HttpModule.register({
      timeout: 3_000,
      maxRedirects: 0,
    }),
    // Risk is computed asynchronously, never inside a task request (O-1).
    BullModule.registerQueue({ name: RISK_ASSESSMENT_QUEUE }),
  ],
  providers: [
    AiService,
    RiskInferenceService,
    RiskAssessmentProcessor,
    RiskRecomputeScheduler,
  ],
  exports: [AiService, BullModule],
})
export class AiModule {}
