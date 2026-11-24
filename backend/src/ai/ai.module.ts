import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { HttpModule } from '@nestjs/axios';
import { RiskFeatureService } from './risk-feature.service';

@Module({
  imports: [
    // ML inference is optional to the core task workflow. Bound its latency so
    // an unavailable or stalled model cannot hold API requests indefinitely.
    HttpModule.register({
      timeout: 3_000,
      maxRedirects: 0,
    }),
  ],
  providers: [AiService, RiskFeatureService],
  exports: [AiService, RiskFeatureService],
})
export class AiModule {}
