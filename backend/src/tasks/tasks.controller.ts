import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AuthGuard } from '@nestjs/passport';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';

@Controller('workspaces/:workspaceId/tasks')
@UseGuards(AuthGuard('jwt'), WorkspaceMemberGuard) 
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasksService.create(workspaceId, dto);
  }

  @Get()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.tasksService.findAllInWorkspace(workspaceId, projectId);
  }

  @Patch(':taskId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasksService.update(workspaceId, taskId, dto);
  }
}
