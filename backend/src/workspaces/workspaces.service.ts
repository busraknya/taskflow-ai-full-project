import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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

  async getWorkspaceMembers(workspaceId: string) {
    return this.prisma.workspaceMembership.findMany({
      where: { workspaceId, status: MembershipStatus.ACTIVE },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, avatarUrl: true },
        },
      },
    });
  }

  async inviteMember(workspaceId: string, inviterUserId: string, email: string, role: WorkspaceRole) {
    const inviterMembership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: inviterUserId } },
    });

    if (!inviterMembership || (inviterMembership.role !== 'OWNER' && inviterMembership.role !== 'ADMIN')) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok.');
    }

    let targetUser = await this.prisma.user.findUnique({ where: { email } });

    if (!targetUser) {
      throw new NotFoundException('Bu e-posta adresine sahip bir kullanıcı sistemde bulunamadı.');
    }

    const existingMembership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: targetUser.id } },
    });

    if (existingMembership) {
      throw new ConflictException('Bu kullanıcı zaten bu workspace\'in üyesi.');
    }

    return this.prisma.workspaceMembership.create({
      data: {
        workspaceId,
        userId: targetUser.id,
        role,
        status: MembershipStatus.ACTIVE, 
        invitedById: inviterUserId,
      },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async updateMemberRole(workspaceId: string, actorUserId: string, targetMembershipId: string, newRole: WorkspaceRole) {
    const actorMembership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
    });

    if (!actorMembership || actorMembership.role !== 'OWNER') {
      throw new ForbiddenException('Sadece Workspace sahibi (OWNER) rolleri değiştirebilir.');
    }

    const targetMembership = await this.prisma.workspaceMembership.findUnique({
      where: { id: targetMembershipId },
    });

    if (!targetMembership || targetMembership.workspaceId !== workspaceId) {
      throw new NotFoundException('Üyelik bulunamadı.');
    }

    if (targetMembership.role === 'OWNER' && newRole !== 'OWNER') {
      const ownerCount = await this.prisma.workspaceMembership.count({
        where: { workspaceId, role: 'OWNER', status: 'ACTIVE' },
      });
      if (ownerCount <= 1) {
        throw new ConflictException({
          code: 'LAST_OWNER_PROTECTION',
          message: 'Workspace\'in son OWNER\'ının rolü düşürülemez.',
        });
      }
    }

    return this.prisma.workspaceMembership.update({
      where: { id: targetMembershipId },
      data: { role: newRole },
    });
  }

}
