import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { SkipRateLimit } from './common/rate-limit/rate-limit.policies';

// Health endpoints are polled by container orchestrators; keep them out of
// rate limits so probes never depend on the limiter itself.
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Kept for existing monitors of `GET /api/v1`; same as liveness. */
  @Get()
  @SkipRateLimit()
  root() {
    return this.appService.liveness();
  }

  @Get('health/live')
  @SkipRateLimit()
  liveness() {
    return this.appService.liveness();
  }

  @Get('health/ready')
  @SkipRateLimit()
  readiness() {
    return this.appService.readiness();
  }
}
