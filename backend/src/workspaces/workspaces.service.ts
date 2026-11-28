import {
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceSettingsDto } from './dto/update-workspace-settings.dto';
import { WorkspaceRole, MembershipStatus, Prisma } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

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
        message: 'This workspace URL (slug) is already in use.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: { name: dto.name, slug: dto.slug, timezone: dto.timezone },
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

  /** Workspace settings; only OWNER and ADMIN may change them. */
  async updateSettings(
    workspaceId: string,
    actorRole: WorkspaceRole,
    dto: UpdateWorkspaceSettingsDto,
  ) {
    if (
      actorRole !== WorkspaceRole.OWNER &&
      actorRole !== WorkspaceRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Only workspace owners and admins can change settings.',
      );
    }
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { timezone: dto.timezone },
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
        throw new ForbiddenException('This workspace invitation has expired.');
      }

      throw new NotFoundException('No pending workspace invitation found.');
    }

    return { message: 'Workspace invitation accepted.' };
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
      throw new NotFoundException('No pending workspace invitation found.');
    }

    return { message: 'Workspace invitation declined.' };
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
        'Only the workspace owner can change roles.',
      );
    }

    // Ownership changes require a dedicated transfer flow so that assigning
    // OWNER cannot accidentally create ambiguous ownership.
    if (newRole === WorkspaceRole.OWNER) {
      throw new ForbiddenException(
        'The OWNER role cannot be assigned here; ownership transfer is a separate operation.',
      );
    }

    const targetMembership = await this.prisma.workspaceMembership.findUnique({
      where: { id: targetMembershipId },
    });

    if (!targetMembership || targetMembership.workspaceId !== workspaceId) {
      throw new NotFoundException('Membership not found.');
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
          message: 'The last owner of a workspace cannot be demoted.',
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
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }

    const targetMembership = await this.prisma.workspaceMembership.findUnique({
      where: { id: targetMembershipId },
    });

    if (!targetMembership || targetMembership.workspaceId !== workspaceId) {
      throw new NotFoundException('Membership not found.');
    }

    if (targetMembership.role === WorkspaceRole.OWNER) {
      if (actorMembership.role !== WorkspaceRole.OWNER) {
        throw new ForbiddenException('An admin cannot remove an owner.');
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
          message: 'The last owner of a workspace cannot be removed.',
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
