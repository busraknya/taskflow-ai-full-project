import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import type { WorkspaceMemberRequest } from '../common/types/authenticated-request';
import { AuthGuard } from '@nestjs/passport';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentsService } from './comments.service';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';

@Controller('workspaces/:workspaceId/tasks/:taskId/comments')
@UseGuards(AuthGuard('jwt'), WorkspaceMemberGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Req() req: WorkspaceMemberRequest,
    @Body() dto: CreateCommentDto,
  ) {
    if (req.membership.role === WorkspaceRole.VIEWER) {
      throw new ForbiddenException('Viewers cannot add comments.');
    }

    return this.commentsService.create(workspaceId, taskId, req.user.id, dto);
  }

  @Get()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.commentsService.findAllForTask(workspaceId, taskId);
  }

  @Delete(':commentId')
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Req() req: WorkspaceMemberRequest,
  ) {
    return this.commentsService.remove(
      workspaceId,
      taskId,
      req.user.id,
      commentId,
    );
  }
}
