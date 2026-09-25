import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { HttpModule } from '@nestjs/axios';
import { RiskFeatureService } from './risk-feature.service';

@Module({
  imports: [HttpModule],
  providers: [AiService, RiskFeatureService],
  exports: [AiService, RiskFeatureService],
})
export class AiModule {}
