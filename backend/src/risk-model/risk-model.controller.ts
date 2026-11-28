import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { WorkspaceMemberRequest } from '../common/types/authenticated-request';
import { WorkspaceMemberGuard } from '../workspaces/guards/workspace-member.guard';
import { UpdateRiskModelDto } from './dto/update-risk-model.dto';
import { RiskModelService } from './risk-model.service';

/** Workspace risk model: status for members, management for owners/admins. */
@Controller('workspaces/:workspaceId/risk-model')
@UseGuards(AuthGuard('jwt'), WorkspaceMemberGuard)
export class RiskModelController {
  constructor(private readonly service: RiskModelService) {}

  @Get()
  status(@Param('workspaceId') workspaceId: string) {
    return this.service.getStatus(workspaceId);
  }

  @Patch()
  update(
    @Param('workspaceId') workspaceId: string,
    @Req() req: WorkspaceMemberRequest,
    @Body() dto: UpdateRiskModelDto,
  ) {
    return this.service.setTrainingEnabled(
      workspaceId,
      req.membership.role,
      dto.trainingEnabled,
    );
  }

  @Post('train')
  @HttpCode(202)
  train(
    @Param('workspaceId') workspaceId: string,
    @Req() req: WorkspaceMemberRequest,
  ) {
    return this.service.requestTraining(
      workspaceId,
      req.membership.role,
      req.user.id,
    );
  }

  @Post('rollback')
  @HttpCode(200)
  rollback(
    @Param('workspaceId') workspaceId: string,
    @Req() req: WorkspaceMemberRequest,
  ) {
    return this.service.rollback(workspaceId, req.membership.role);
  }
}
