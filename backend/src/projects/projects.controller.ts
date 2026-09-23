import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
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
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(workspaceId, dto);
  }

  @Get()
  async findAll(@Param('workspaceId') workspaceId: string) {
    return this.projectsService.findAllInWorkspace(workspaceId);
  }
}