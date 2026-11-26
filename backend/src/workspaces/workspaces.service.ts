import { Injectable, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { WorkspaceRole, MembershipStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

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

    const memberships = await this.prisma.workspaceMembership.findMany({
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

    // Until an invitation is accepted, only the address the inviter typed is
    // shown; the invitee's profile (name, avatar) is not disclosed.
    return memberships.map((membership) =>
      membership.status === MembershipStatus.PENDING
        ? {
            ...membership,
            user: {
              id: membership.user.id,
              email: membership.user.email,
              fullName: null,
              avatarUrl: null,
            },
          }
        : membership,
    );
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
    const now = new Date();
    const invitationExpiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

    // Identical response whether or not the address belongs to an account, so
    // the endpoint cannot be used to enumerate users or harvest profile data.
    const response = {
      message: 'Davet oluşturuldu.',
      email: normalizedEmail,
      role,
      invitationExpiresAt,
    };

    const targetUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!targetUser || targetUser.deletedAt || targetUser.disabledAt) {
      // No membership is created and no email is sent.
      return response;
    }

    if (targetUser.id === inviterUserId) {
      throw new ConflictException('Kendinizi workspace davet edemezsiniz.');
    }

    const existingMembership = await this.prisma.workspaceMembership.findUnique(
      {
        where: {
          workspaceId_userId: { workspaceId, userId: targetUser.id },
        },
      },
    );

    if (existingMembership?.status === MembershipStatus.ACTIVE) {
      throw new ConflictException("Bu kullanıcı zaten bu workspace'in üyesi.");
    }
    if (
      existingMembership?.status === MembershipStatus.PENDING &&
      existingMembership.invitationExpiresAt &&
      existingMembership.invitationExpiresAt > now
    ) {
      throw new ConflictException(
        'Bu kullanıcı için bekleyen bir davet zaten var.',
      );
    }

    const membershipData = {
      role,
      status: MembershipStatus.PENDING,
      invitedById: inviterUserId,
      invitedAt: now,
      invitationExpiresAt,
      joinedAt: null,
    };

    if (existingMembership) {
      // Re-invite only from an expired/stale invitation. The conditional
      // write re-checks the state atomically, so a concurrent accept or a
      // parallel re-invite can never be overwritten (an ACTIVE membership is
      // never turned back into an invitation).
      const reinvited = await this.prisma.workspaceMembership.updateMany({
        where: {
          id: existingMembership.id,
          OR: [
            { status: MembershipStatus.EXPIRED },
            {
              status: MembershipStatus.PENDING,
              OR: [
                { invitationExpiresAt: null },
                { invitationExpiresAt: { lte: now } },
              ],
            },
          ],
        },
        data: membershipData,
      });
      if (reinvited.count !== 1) {
        throw new ConflictException(
          'Davet durumu değişti. Lütfen üye listesini yenileyin.',
        );
      }
    } else {
      try {
        await this.prisma.workspaceMembership.create({
          data: { workspaceId, userId: targetUser.id, ...membershipData },
        });
      } catch (error) {
        // A parallel request created the invitation first.
        if (isUniqueConstraintViolation(error)) {
          throw new ConflictException(
            'Bu kullanıcı için bekleyen bir davet zaten var.',
          );
        }
        throw error;
      }
    }

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

    return response;
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
      where: {
        userId,
        status: MembershipStatus.PENDING,
        workspace: { deletedAt: null },
      },
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

  /**
   * Single-use, atomic acceptance: one conditional UPDATE consumes the
   * invitation only if it belongs to the caller, is still PENDING, has not
   * expired and its workspace still exists. Concurrent accepts therefore have
   * exactly one winner; (workspaceId, userId) is unique, so no duplicate
   * membership can be created.
   */
  async acceptInvitation(workspaceId: string, userId: string) {
    const now = new Date();
    const result = await this.prisma.workspaceMembership.updateMany({
      where: {
        workspaceId,
        userId,
        status: MembershipStatus.PENDING,
        invitationExpiresAt: { gt: now },
        // Defence in depth: ownership is never granted through an invitation.
        role: { not: WorkspaceRole.OWNER },
        workspace: { deletedAt: null },
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

    return { message: 'Workspace daveti kabul edildi.' };
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
