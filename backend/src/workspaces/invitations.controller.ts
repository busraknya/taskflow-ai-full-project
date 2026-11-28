import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { AuthRateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { InvitationTokenDto } from './dto/invitation-token.dto';
import { InvitationsService } from './invitations.service';

/**
 * Invitation links. The token is sent in the request body (never in a URL)
 * so it does not appear in access logs.
 */
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  /** Public: what the invitation page shows before sign-in. */
  @Post('preview')
  @HttpCode(200)
  @UseGuards(AuthRateLimitGuard)
  preview(@Body() dto: InvitationTokenDto) {
    return this.invitations.preview(dto.token);
  }

  @Post('accept')
  @HttpCode(200)
  @UseGuards(AuthGuard('jwt'), AuthRateLimitGuard)
  accept(@Body() dto: InvitationTokenDto, @Req() req: AuthenticatedRequest) {
    return this.invitations.accept(dto.token, req.user.id);
  }
}
