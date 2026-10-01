import { Controller, Get, Post, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { AuthGuard } from '@nestjs/passport';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';

@Controller('workspaces/:workspaceId/tasks/:taskId/comments')
@UseGuards(AuthGuard('jwt'), WorkspaceMemberGuard) // Tenant koruması aktif!
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Req() req: any,
    @Body() dto: CreateCommentDto,
  ) {
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
    @Req() req: any,
  ) {
    return this.commentsService.remove(workspaceId, taskId, req.user.id, commentId);
  }
}