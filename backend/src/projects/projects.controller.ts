import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { AuthGuard } from '@nestjs/passport';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';

@Controller('workspaces/:workspaceId/projects')
@UseGuards(AuthGuard('jwt'), WorkspaceMemberGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Req() req: any,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(workspaceId, req.user.id, dto);
  }

  @Get()
  async findAll(@Param('workspaceId') workspaceId: string) {
    return this.projectsService.findAllInWorkspace(workspaceId);
  }

  @Delete(':projectId')
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('projectId') projectId: string,
    @Req() req: any,
  ) {
    return this.projectsService.remove(workspaceId, req.user.id, projectId);
  }
}