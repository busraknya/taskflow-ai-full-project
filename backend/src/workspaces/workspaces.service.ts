import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { WorkspaceRole, MembershipStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class WorkspacesService {
  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

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

    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { name: dto.name, slug: dto.slug },
      });

      await tx.workspaceMembership.create({
        data: {
          workspaceId: workspace.id,
          userId,
          role: WorkspaceRole.OWNER,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });

      return workspace;
    });
  }

  async findAllForUser(userId: string) {
    const memberships = await this.prisma.workspaceMembership.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: { workspace: true },
    });

    return memberships.map((membership) => ({
      ...membership.workspace,
      role: membership.role,
    }));
  }

  async findOne(workspaceId: string) {
    return this.prisma.workspace.findUnique({ where: { id: workspaceId } });
  }

  async getWorkspaceMembers(workspaceId: string) {
    await this.prisma.workspaceMembership.updateMany({
      where: {
        workspaceId,
        status: MembershipStatus.PENDING,
        invitationExpiresAt: { lte: new Date() },
      },
      data: { status: MembershipStatus.EXPIRED },
    });

    return this.prisma.workspaceMembership.findMany({
      where: {
        workspaceId,
        status: { in: [MembershipStatus.ACTIVE, MembershipStatus.PENDING] },
      },
      include: {
        user: {
          select: { id: true, fullName: true, email: true, avatarUrl: true },
        },
      },
    });
  }

  async inviteMember(
    workspaceId: string,
    inviterUserId: string,
    email: string,
    role: WorkspaceRole,
  ) {
    const inviterMembership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: inviterUserId } },
    });

    if (
      !inviterMembership ||
      inviterMembership.status !== MembershipStatus.ACTIVE ||
      (inviterMembership.role !== WorkspaceRole.OWNER &&
        inviterMembership.role !== WorkspaceRole.ADMIN)
    ) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok.');
    }

    if (role === WorkspaceRole.OWNER) {
      throw new ForbiddenException(
        'OWNER rolü davet sırasında atanamaz. Sahiplik devri ayrı bir işlem olmalıdır.',
      );
    }

    if (
      inviterMembership.role === WorkspaceRole.ADMIN &&
      role === WorkspaceRole.ADMIN
    ) {
      throw new ForbiddenException('ADMIN rolünü yalnızca OWNER atayabilir.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const targetUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!targetUser) {
      throw new NotFoundException(
        'Bu e-posta adresine sahip bir kullanıcı sistemde bulunamadı.',
      );
    }

    if (targetUser.id === inviterUserId) {
      throw new ConflictException('Kendinizi workspace davet edemezsiniz.');
    }

    const existingMembership = await this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: targetUser.id },
      },
    });

    if (existingMembership?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException("Bu kullanıcı zaten bu workspace'in üyesi.");
    }
    const now = new Date();
    if (existingMembership?.status === MembershipStatus.PENDING) {
      if (
        existingMembership.invitationExpiresAt &&
        existingMembership.invitationExpiresAt > now
      ) {
        throw new ConflictException('Bu kullanıcı için bekleyen bir davet zaten var.');
      }
      await this.prisma.workspaceMembership.update({
        where: { id: existingMembership.id },
        data: { status: MembershipStatus.EXPIRED },
      });
    }


    const invitationExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const membershipData = {
      role,
      status: MembershipStatus.PENDING,
      invitedById: inviterUserId,
      invitedAt: now,
      invitationExpiresAt,
      joinedAt: null,
    };

    const membership = existingMembership
      ? await this.prisma.workspaceMembership.update({
          where: { id: existingMembership.id },
          data: membershipData,
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
        })
      : await this.prisma.workspaceMembership.create({
          data: {
            workspaceId,
            userId: targetUser.id,
            ...membershipData,
          },
          include: {
            user: { select: { id: true, fullName: true, email: true } },
          },
        });

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    this.eventEmitter.emit('workspace.member_invited', {
      workspaceId,
      userId: targetUser.id,
      email: targetUser.email,
      fullName: targetUser.fullName,
      workspaceName: workspace?.name || 'Workspace',
      expiresAt: invitationExpiresAt,
    });

    return membership;
  }

  async getPendingInvitations(userId: string) {
    await this.prisma.workspaceMembership.updateMany({
      where: {
        userId,
        status: MembershipStatus.PENDING,
        invitationExpiresAt: { lte: new Date() },
      },
      data: { status: MembershipStatus.EXPIRED },
    });

    return this.prisma.workspaceMembership.findMany({
      where: { userId, status: MembershipStatus.PENDING },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true },
        },
        invitedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
      orderBy: { invitedAt: 'desc' },
    });
  }

  async acceptInvitation(workspaceId: string, userId: string) {
    const now = new Date();
    const result = await this.prisma.workspaceMembership.updateMany({
      where: {
        workspaceId,
        userId,
        status: MembershipStatus.PENDING,
        invitationExpiresAt: { gt: now },
      },
      data: {
        status: MembershipStatus.ACTIVE,
        joinedAt: now,
        invitationExpiresAt: null,
      },
    });

    if (result.count !== 1) {
      const membership = await this.prisma.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });

      if (
        membership?.status === MembershipStatus.PENDING &&
        (!membership.invitationExpiresAt ||
          membership.invitationExpiresAt <= now)
      ) {
        await this.prisma.workspaceMembership.update({
          where: { id: membership.id },
          data: { status: MembershipStatus.EXPIRED },
        });
        throw new ForbiddenException('Workspace davetinin süresi dolmuş.');
      }

      throw new NotFoundException('Bekleyen workspace daveti bulunamadı.');
    }

    return this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: {
        workspace: true,
      },
    });
  }

  async declineInvitation(workspaceId: string, userId: string) {
    const result = await this.prisma.workspaceMembership.deleteMany({
      where: {
        workspaceId,
        userId,
        status: MembershipStatus.PENDING,
      },
    });

    if (result.count !== 1) {
      throw new NotFoundException('Bekleyen workspace daveti bulunamadı.');
    }

    return { message: 'Workspace daveti reddedildi.' };
  }

  async updateMemberRole(
    workspaceId: string,
    actorUserId: string,
    targetMembershipId: string,
    newRole: WorkspaceRole,
  ) {
    const actorMembership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
    });

    if (!actorMembership || actorMembership.role !== WorkspaceRole.OWNER) {
      throw new ForbiddenException(
        'Sadece Workspace sahibi (OWNER) rolleri değiştirebilir.',
      );
    }

    // Ownership changes require a dedicated transfer flow so that assigning
    // OWNER cannot accidentally create ambiguous ownership.
    if (newRole === WorkspaceRole.OWNER) {
      throw new ForbiddenException(
        'OWNER rolü bu işlemle atanamaz. Sahiplik devri ayrı bir işlem olmalıdır.',
      );
    }

    const targetMembership = await this.prisma.workspaceMembership.findUnique({
      where: { id: targetMembershipId },
    });

    if (!targetMembership || targetMembership.workspaceId !== workspaceId) {
      throw new NotFoundException('Üyelik bulunamadı.');
    }

    if (targetMembership.role === WorkspaceRole.OWNER) {
      const ownerCount = await this.prisma.workspaceMembership.count({
        where: {
          workspaceId,
          role: WorkspaceRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      if (ownerCount <= 1) {
        throw new ConflictException({
          code: 'LAST_OWNER_PROTECTION',
          message: "Workspace'in son OWNER'ının rolü düşürülemez.",
        });
      }
    }

    return this.prisma.workspaceMembership.update({
      where: { id: targetMembershipId },
      data: { role: newRole },
    });
  }

  async removeMember(
    workspaceId: string,
    actorUserId: string,
    targetMembershipId: string,
  ) {
    const actorMembership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
    });

    if (
      !actorMembership ||
      (actorMembership.role !== WorkspaceRole.OWNER &&
        actorMembership.role !== WorkspaceRole.ADMIN)
    ) {
      throw new ForbiddenException('Bu işlem için yetkiniz yok.');
    }

    const targetMembership = await this.prisma.workspaceMembership.findUnique({
      where: { id: targetMembershipId },
    });

    if (!targetMembership || targetMembership.workspaceId !== workspaceId) {
      throw new NotFoundException('Üyelik bulunamadı.');
    }

    if (targetMembership.role === WorkspaceRole.OWNER) {
      if (actorMembership.role !== WorkspaceRole.OWNER) {
        throw new ForbiddenException("ADMIN rolündeki biri bir OWNER'ı çıkaramaz.");
      }

      const ownerCount = await this.prisma.workspaceMembership.count({
        where: {
          workspaceId,
          role: WorkspaceRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      if (ownerCount <= 1) {
        throw new ConflictException({
          code: 'LAST_OWNER_PROTECTION',
          message: "Workspace'in son OWNER'ı silinemez.",
        });
      }
    }

    return this.prisma.workspaceMembership.delete({
      where: { id: targetMembershipId },
    });
  }

  async getAuditLogs(workspaceId: string) {
    return this.prisma.auditLogEntry.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
