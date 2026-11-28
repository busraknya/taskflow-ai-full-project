import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { WorkspaceGuardRequest } from '../../common/types/authenticated-request';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<WorkspaceGuardRequest>();
    const user = request.user;
    const workspaceId =
      request.params.workspaceId ?? request.body?.workspaceId;

    if (!user || !workspaceId) {
      throw new NotFoundException('Workspace not found.');
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || workspace.deletedAt) {
      throw new NotFoundException('Workspace not found.');
    }

    const membership = await this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: user.id,
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new NotFoundException('Workspace not found.');
    }

    request.membership = membership;
    return true;
  }
}
