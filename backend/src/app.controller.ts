import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SkipRateLimit } from './common/rate-limit/rate-limit.policies';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // Container health checks poll this endpoint; keep it out of rate limits.
  @Get()
  @SkipRateLimit()
  getHello(): string {
    return this.appService.getHello();
  }
}
