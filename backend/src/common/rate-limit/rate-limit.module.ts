import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { RateLimitService } from './rate-limit.service';
import { AuthRateLimitGuard } from './rate-limit.guard';
import { IpRateLimitGuard } from './ip-rate-limit.guard';
import { UserRateLimitInterceptor } from './user-rate-limit.interceptor';

@Global()
@Module({
  providers: [
    RateLimitService,
    AuthRateLimitGuard,
    // Applied to every route: per-IP baseline before route guards, and
    // per-user limits (plus @SensitiveRateLimit policies) after them.
    { provide: APP_GUARD, useClass: IpRateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: UserRateLimitInterceptor },
  ],
  exports: [RateLimitService, AuthRateLimitGuard],
})
export class RateLimitModule {}
