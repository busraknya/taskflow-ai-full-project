import { Global, Module } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { AuthRateLimitGuard } from './rate-limit.guard';

@Global()
@Module({
  providers: [RateLimitService, AuthRateLimitGuard],
  exports: [RateLimitService, AuthRateLimitGuard],
})
export class RateLimitModule {}
