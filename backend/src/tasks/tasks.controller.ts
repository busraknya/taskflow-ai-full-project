import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import type { WorkspaceMemberRequest } from '../common/types/authenticated-request';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { AuthGuard } from '@nestjs/passport';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';

@Controller('workspaces/:workspaceId/tasks')
@UseGuards(AuthGuard('jwt'), WorkspaceMemberGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  private assertCanWrite(req: WorkspaceMemberRequest) {
    if (req.membership.role === WorkspaceRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot create or modify tasks.');
    }
  }

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Req() req: WorkspaceMemberRequest,
    @Body() dto: CreateTaskDto,
  ) {
    this.assertCanWrite(req);
    return this.tasksService.create(workspaceId, req.user.id, dto);
  }

  @Get()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.tasksService.findAllInWorkspace(workspaceId, projectId);
  }

  @Get(':taskId')
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.tasksService.findOneInWorkspace(workspaceId, taskId);
  }

  @Patch(':taskId')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Req() req: WorkspaceMemberRequest,
    @Body() dto: UpdateTaskDto,
  ) {
    this.assertCanWrite(req);
    return this.tasksService.update(workspaceId, taskId, req.user.id, dto);
  }
}
