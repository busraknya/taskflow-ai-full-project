import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { WorkspaceRole, MembershipStatus } from '@prisma/client';

@Injectable()
export class WorkspacesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateWorkspaceDto) {
    const existing = await this.prisma.workspace.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException({
        code: 'SLUG_ALREADY_EXISTS',
        message: 'Bu slug (adres adı) zaten kullanımda.',
      });
    }

    const workspace = await this.prisma.$transaction(async (tx) => {
      const newWorkspace = await tx.workspace.create({
        data: {
          name: dto.name,
          slug: dto.slug,
        },
      });

      
      await tx.workspaceMembership.create({
        data: {
          workspaceId: newWorkspace.id,
          userId: userId,
          role: WorkspaceRole.OWNER,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });

      return newWorkspace;
    });

    return workspace;
  }

  async findAllForUser(userId: string) {
    
    const memberships = await this.prisma.workspaceMembership.findMany({
      where: {
        userId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        workspace: true,
      },
    });

    return memberships.map((m) => ({
      ...m.workspace,
      role: m.role,
    }));
  }

  async findOne(workspaceId: string) {
    return this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
  }
}
