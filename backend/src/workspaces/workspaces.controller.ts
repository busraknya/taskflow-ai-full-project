import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Patch,
  Delete,
} from '@nestjs/common';
import type {
  AuthenticatedRequest,
  WorkspaceMemberRequest,
} from '../common/types/authenticated-request';
import { WorkspacesService } from './workspaces.service';
import { InvitationsService } from './invitations.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateWorkspaceSettingsDto } from './dto/update-workspace-settings.dto';
import { AuthGuard } from '@nestjs/passport';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import { PaginationQueryDto } from '../common/pagination/pagination';
import { AuthRateLimitGuard } from '../common/rate-limit/rate-limit.guard';
import { SensitiveRateLimit } from '../common/rate-limit/rate-limit.policies';

@Controller('workspaces')
@UseGuards(AuthGuard('jwt'))
export class WorkspacesController {
  constructor(
    private readonly workspacesService: WorkspacesService,
    private readonly invitationsService: InvitationsService,
  ) {}

  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateWorkspaceDto,
  ) {
    return this.workspacesService.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: AuthenticatedRequest) {
    return this.workspacesService.findAllForUser(req.user.id);
  }

  @Get('invitations')
  async getPendingInvitations(@Req() req: AuthenticatedRequest) {
    return this.workspacesService.getPendingInvitations(req.user.id);
  }

  @Post(':workspaceId/members/accept')
  async acceptInvitation(
    @Param('workspaceId') workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workspacesService.acceptInvitation(workspaceId, req.user.id);
  }

  @Delete(':workspaceId/members/invitation')
  async declineInvitation(
    @Param('workspaceId') workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workspacesService.declineInvitation(workspaceId, req.user.id);
  }

  @Post(':workspaceId/members/invite')
  @UseGuards(WorkspaceMemberGuard, AuthRateLimitGuard)
  // Per-user cap on invitation emails, independent of the client IP.
  @SensitiveRateLimit('workspace-invite')
  async inviteMember(
    @Param('workspaceId') workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: InviteMemberDto,
  ) {
    return this.invitationsService.create(
      workspaceId,
      req.user.id,
      dto.email,
      dto.role,
    );
  }

  /** Open invitations (owners/admins). */
  @Get(':workspaceId/invitations')
  @UseGuards(WorkspaceMemberGuard)
  async listInvitations(
    @Param('workspaceId') workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.invitationsService.list(workspaceId, req.user.id);
  }

  @Delete(':workspaceId/invitations/:invitationId')
  @UseGuards(WorkspaceMemberGuard)
  async revokeInvitation(
    @Param('workspaceId') workspaceId: string,
    @Param('invitationId') invitationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.invitationsService.revoke(
      workspaceId,
      req.user.id,
      invitationId,
    );
  }

  @Post(':workspaceId/invitations/:invitationId/resend')
  @UseGuards(WorkspaceMemberGuard, AuthRateLimitGuard)
  @SensitiveRateLimit('workspace-invite')
  async resendInvitation(
    @Param('workspaceId') workspaceId: string,
    @Param('invitationId') invitationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.invitationsService.resend(
      workspaceId,
      req.user.id,
      invitationId,
    );
  }

  @Get(':workspaceId/members')
  @UseGuards(WorkspaceMemberGuard)
  async getWorkspaceMembers(@Param('workspaceId') workspaceId: string) {
    return this.workspacesService.getWorkspaceMembers(workspaceId);
  }

  @Patch(':workspaceId/members/:membershipId')
  @UseGuards(WorkspaceMemberGuard)
  async updateMemberRole(
    @Param('workspaceId') workspaceId: string,
    @Param('membershipId') membershipId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.workspacesService.updateMemberRole(
      workspaceId,
      req.user.id,
      membershipId,
      dto.role,
    );
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceMemberGuard)
  async findOne(@Param('workspaceId') workspaceId: string) {
    return this.workspacesService.findOne(workspaceId);
  }

  @Patch(':workspaceId')
  @UseGuards(WorkspaceMemberGuard)
  async updateSettings(
    @Param('workspaceId') workspaceId: string,
    @Req() req: WorkspaceMemberRequest,
    @Body() dto: UpdateWorkspaceSettingsDto,
  ) {
    return this.workspacesService.updateSettings(
      workspaceId,
      req.membership.role,
      dto,
    );
  }

  @Get(':workspaceId/audit')
  @UseGuards(WorkspaceMemberGuard)
  async getAuditLogs(
    @Param('workspaceId') workspaceId: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.workspacesService.getAuditLogs(workspaceId, query);
  }

  @Delete(':workspaceId/members/:membershipId')
  @UseGuards(WorkspaceMemberGuard)
  async removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('membershipId') membershipId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workspacesService.removeMember(
      workspaceId,
      req.user.id,
      membershipId,
    );
  }
}
