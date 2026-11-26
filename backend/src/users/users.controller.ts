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

@Controller('users/me')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
