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
  async create(@Req() req: any, @Body() dto: CreateWorkspaceDto) {
    return this.workspacesService.create(req.user.id, dto);
  }

  @Get()
  async findAll(@Req() req: any) {
    return this.workspacesService.findAllForUser(req.user.id);
  }

  @Post(':workspaceId/members/invite')
  @UseGuards(WorkspaceMemberGuard)
  async inviteMember(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
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
    @Req() req: any,
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
    @Req() req: any,
  ) {
    return this.workspacesService.removeMember(
      workspaceId,
      req.user.id,
      membershipId,
    );
  }
}
