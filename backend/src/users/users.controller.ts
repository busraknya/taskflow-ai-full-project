import { Controller, Get, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('users/me')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('notification-preferences')
  async getPreferences(@Req() req: any) {
    return this.usersService.getPreferences(req.user.id);
  }

  @Patch('notification-preferences')
  async updatePreference(
    @Req() req: any,
    @Body() body: { category: string; emailEnabled: boolean },
  ) {
    return this.usersService.updatePreference(req.user.id, body.category, body.emailEnabled);
  }
}