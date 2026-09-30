import { Controller, Get, Post, Body, Param, UseGuards, Req, Patch, Delete } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { AuthGuard } from '@nestjs/passport';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';
import { WorkspaceRole } from '@prisma/client';

@Controller('workspaces')
@UseGuards(AuthGuard('jwt')) 
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  async create(@Req() req: any, @Body() dto: CreateWorkspaceDto) {
    const userId = req.user.id;
    return this.workspacesService.create(userId, dto);
  }

  @Get()
  async findAll(@Req() req: any) {
    const userId = req.user.id;
    return this.workspacesService.findAllForUser(userId);
  }

  @Post(':workspaceId/members/invite')
  @UseGuards(WorkspaceMemberGuard)
  async inviteMember(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
    @Body() body: { email: string; role: WorkspaceRole },
  ) {
    return this.workspacesService.inviteMember(workspaceId, req.user.id, body.email, body.role);
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
    @Body() body: { role: WorkspaceRole },
  ) {
    return this.workspacesService.updateMemberRole(workspaceId, req.user.id, membershipId, body.role);
  }

  @Get(':workspaceId')
  @UseGuards(WorkspaceMemberGuard) 
  async findOne(@Param('workspaceId') workspaceId: string) {
    return this.workspacesService.findOne(workspaceId);
  }

  @Delete(':workspaceId/members/:membershipId')
  @UseGuards(WorkspaceMemberGuard)
  async removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('membershipId') membershipId: string,
    @Req() req: any,
  ) {
    return this.workspacesService.removeMember(workspaceId, req.user.id, membershipId);
  }
}