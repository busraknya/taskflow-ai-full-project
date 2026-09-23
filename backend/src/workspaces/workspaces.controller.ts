import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { AuthGuard } from '@nestjs/passport';
import { WorkspaceMemberGuard } from './guards/workspace-member.guard';

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

  @Get(':workspaceId')
  @UseGuards(WorkspaceMemberGuard) 
  async findOne(@Param('workspaceId') workspaceId: string) {
    return this.workspacesService.findOne(workspaceId);
  }
}