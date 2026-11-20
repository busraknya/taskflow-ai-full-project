import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';
import { ChangePasswordDto } from './dto/change-password.dto';

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
    @Body() body: { category: string; emailEnabled: boolean },
  ) {
    return this.usersService.updatePreference(
      req.user.id,
      body.category,
      body.emailEnabled,
    );
  }

  @Patch('password')
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(req.user.id, dto);
  }
}
