import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateNotificationPreferenceDto } from './dto/update-notification-preference.dto';
import { setRefreshCookie } from '../auth/refresh-cookie';
import { SensitiveRateLimit } from '../common/rate-limit/rate-limit.policies';

@Controller('users/me')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** The signed-in user's own profile; lets clients restore it after a reload. */
  @Get()
  async getProfile(@Req() req: AuthenticatedRequest) {
    return this.usersService.getProfile(req.user.id);
  }

  @Get('notification-preferences')
  async getPreferences(@Req() req: AuthenticatedRequest) {
    return this.usersService.getPreferences(req.user.id);
  }

  @Patch('notification-preferences')
  async updatePreference(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.usersService.updatePreference(
      req.user.id,
      dto.category,
      dto.emailEnabled,
    );
  }

  @Patch('password')
  // Limits brute force of the current password with a stolen access token.
  @SensitiveRateLimit('password-change')
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.usersService.changePassword(req.user.id, dto);

    // Other sessions are revoked; the caller continues on a fresh session.
    // The new refresh token is only delivered via the HttpOnly cookie.
    setRefreshCookie(res, result.refreshToken);

    return { message: result.message, accessToken: result.accessToken };
  }
}
