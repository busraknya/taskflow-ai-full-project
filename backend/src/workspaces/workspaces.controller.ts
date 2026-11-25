import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Patch,
  Delete,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { AuthGuard } from '@nestjs/passport';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';

@Controller('workspaces')
@UseGuards(AuthGuard('jwt'))
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

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
  @UseGuards(WorkspaceMemberGuard)
  async inviteMember(
    @Param('workspaceId') workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Body() dto: InviteMemberDto,
  ) {
    return this.workspacesService.inviteMember(
      workspaceId,
      req.user.id,
      dto.email,
      dto.role,
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

  @Get(':workspaceId/audit')
  @UseGuards(WorkspaceMemberGuard)
  async getAuditLogs(@Param('workspaceId') workspaceId: string) {
    return this.workspacesService.getAuditLogs(workspaceId);
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
