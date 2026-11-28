import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MembershipStatus, Prisma, WorkspaceRole } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../common/audit/audit.service';
import { isEmailDeliveryEnabled } from '../notifications/mail-transport';
import { PrismaService } from '../prisma/prisma.service';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATION_CREATED_EVENT = 'workspace.invitation_created';

export interface InvitationCreatedEvent {
  invitationId: string;
  workspaceId: string;
  email: string;
  workspaceName: string;
  inviterName: string | null;
  acceptUrl: string;
  expiresAt: Date;
}

const MANAGERS: WorkspaceRole[] = [WorkspaceRole.OWNER, WorkspaceRole.ADMIN];

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

/**
 * The token travels in the URL fragment (#...), which browsers never send to
 * a server, so it cannot end up in access logs or Referer headers.
 */
export function acceptUrlFor(token: string): string {
  const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );
  return `${base}/invite#${token}`;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

/**
 * Email invitations (industry-standard flow): an invitation belongs to an
 * address, not an account. The recipient opens a single-use link, signs in or
 * creates an account, and joins. Possession of the link is what authorises
 * acceptance, because the product does not verify email addresses.
 */
@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
  ) {}

  private async managerMembership(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (
      !membership ||
      membership.status !== MembershipStatus.ACTIVE ||
      !MANAGERS.includes(membership.role)
    ) {
      throw new ForbiddenException(
        'Only workspace owners and admins can manage invitations.',
      );
    }
    return membership;
  }

  private assertCanGrant(actorRole: WorkspaceRole, role: WorkspaceRole) {
    if (role === WorkspaceRole.OWNER) {
      throw new ForbiddenException(
        'Ownership cannot be granted through an invitation.',
      );
    }
    if (actorRole === WorkspaceRole.ADMIN && role === WorkspaceRole.ADMIN) {
      throw new ForbiddenException(
        'Only the workspace owner can invite admins.',
      );
    }
  }

  private async publish(
    invitation: {
      id: string;
      workspaceId: string;
      email: string;
      expiresAt: Date;
    },
    token: string,
    inviterId: string,
  ) {
    const [workspace, inviter] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: invitation.workspaceId },
        select: { name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: inviterId },
        select: { fullName: true },
      }),
    ]);
    const acceptUrl = acceptUrlFor(token);
    const event: InvitationCreatedEvent = {
      invitationId: invitation.id,
      workspaceId: invitation.workspaceId,
      email: invitation.email,
      workspaceName: workspace?.name ?? 'Workspace',
      inviterName: inviter?.fullName ?? null,
      acceptUrl,
      expiresAt: invitation.expiresAt,
    };
    this.events.emit(INVITATION_CREATED_EVENT, event);
    return acceptUrl;
  }

  /**
   * Creates an invitation for any address. The response is the same whether
   * or not the address has an account, so it reveals nothing about accounts.
   * The link is returned to the inviter so it can be shared manually, which
   * is the only option when email delivery is not configured.
   */
  async create(
    workspaceId: string,
    inviterId: string,
    rawEmail: string,
    role: WorkspaceRole,
  ) {
    const inviter = await this.managerMembership(workspaceId, inviterId);
    this.assertCanGrant(inviter.role, role);
    const email = rawEmail.trim().toLowerCase();
    const now = new Date();

    const activeMember = await this.prisma.workspaceMembership.findFirst({
      where: {
        workspaceId,
        status: MembershipStatus.ACTIVE,
        user: { email },
      },
      select: { id: true },
    });
    if (activeMember) {
      throw new ConflictException(
        'This person is already a member of the workspace.',
      );
    }

    const { token, tokenHash } = newToken();
    const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    let invitation;
    try {
      invitation = await this.prisma.$transaction(async (tx) => {
        // An expired open invitation no longer blocks a new one.
        await tx.workspaceInvitation.updateMany({
          where: {
            workspaceId,
            email,
            acceptedAt: null,
            revokedAt: null,
            expiresAt: { lte: now },
          },
          data: { revokedAt: now },
        });
        return tx.workspaceInvitation.create({
          data: {
            workspaceId,
            email,
            role,
            tokenHash,
            invitedById: inviterId,
            expiresAt,
          },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'There is already a pending invitation for this address. Resend or revoke it instead.',
        );
      }
      throw error;
    }

    const acceptUrl = await this.publish(invitation, token, inviterId);
    await this.audit.log({
      workspaceId,
      actorId: inviterId,
      entityType: 'INVITATION',
      entityId: invitation.id,
      action: 'INVITATION_CREATED',
      metadata: { role },
    });
    return {
      message: 'Invitation created.',
      invitationId: invitation.id,
      email,
      role,
      invitationExpiresAt: expiresAt,
      acceptUrl,
      emailDelivery: isEmailDeliveryEnabled() ? 'queued' : 'disabled',
    };
  }

  async list(workspaceId: string, actorId: string) {
    await this.managerMembership(workspaceId, actorId);
    const now = new Date();
    const invitations = await this.prisma.workspaceInvitation.findMany({
      where: { workspaceId, acceptedAt: null, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
        invitedBy: { select: { fullName: true } },
      },
    });
    return invitations.map((i) => ({ ...i, expired: i.expiresAt <= now }));
  }

  async revoke(workspaceId: string, actorId: string, invitationId: string) {
    const actor = await this.managerMembership(workspaceId, actorId);
    const invitation = await this.prisma.workspaceInvitation.findFirst({
      where: { id: invitationId, workspaceId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    this.assertCanGrant(actor.role, invitation.role);
    const result = await this.prisma.workspaceInvitation.updateMany({
      where: {
        id: invitationId,
        workspaceId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (result.count !== 1)
      throw new NotFoundException('Invitation not found.');
    await this.audit.log({
      workspaceId,
      actorId,
      entityType: 'INVITATION',
      entityId: invitationId,
      action: 'INVITATION_REVOKED',
    });
    return { message: 'Invitation revoked.' };
  }

  /** Issues a new link (the old one stops working) and a new expiry. */
  async resend(workspaceId: string, actorId: string, invitationId: string) {
    const actor = await this.managerMembership(workspaceId, actorId);
    const invitation = await this.prisma.workspaceInvitation.findFirst({
      where: { id: invitationId, workspaceId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found.');
    this.assertCanGrant(actor.role, invitation.role);
    const { token, tokenHash } = newToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    const result = await this.prisma.workspaceInvitation.updateMany({
      where: {
        id: invitationId,
        workspaceId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { tokenHash, expiresAt },
    });
    if (result.count !== 1)
      throw new NotFoundException('Invitation not found.');
    const acceptUrl = await this.publish(
      { id: invitationId, workspaceId, email: invitation.email, expiresAt },
      token,
      actorId,
    );
    return {
      message: 'Invitation sent again.',
      invitationId,
      invitationExpiresAt: expiresAt,
      acceptUrl,
      emailDelivery: isEmailDeliveryEnabled() ? 'queued' : 'disabled',
    };
  }

  private async findByToken(token: string) {
    if (!token || token.length > 128) return null;
    return this.prisma.workspaceInvitation.findUnique({
      where: { tokenHash: hashToken(token) },
      include: {
        workspace: {
          select: { id: true, name: true, slug: true, deletedAt: true },
        },
        invitedBy: { select: { fullName: true } },
      },
    });
  }

  /** What the invitation page shows before the recipient signs in. */
  async preview(token: string) {
    const invitation = await this.findByToken(token);
    if (!invitation || invitation.workspace.deletedAt) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'This invitation link is not valid.',
      });
    }
    const status = invitation.acceptedAt
      ? 'accepted'
      : invitation.revokedAt
        ? 'revoked'
        : invitation.expiresAt <= new Date()
          ? 'expired'
          : 'pending';
    return {
      status,
      email: invitation.email,
      role: invitation.role,
      workspaceName: invitation.workspace.name,
      inviterName: invitation.invitedBy?.fullName ?? null,
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Single-use, atomic acceptance. The conditional update consumes the
   * invitation exactly once; the membership is created or activated in the
   * same transaction.
   */
  async accept(token: string, userId: string) {
    const invitation = await this.findByToken(token);
    if (!invitation || invitation.workspace.deletedAt) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'This invitation link is not valid.',
      });
    }
    const now = new Date();
    if (invitation.acceptedAt || invitation.revokedAt) {
      throw new GoneException({
        code: 'INVITATION_USED',
        message: 'This invitation has already been used or was revoked.',
      });
    }
    if (invitation.expiresAt <= now) {
      throw new GoneException({
        code: 'INVITATION_EXPIRED',
        message: 'This invitation has expired. Ask for a new one.',
      });
    }
    // Defence in depth: ownership is never granted through an invitation.
    if (invitation.role === WorkspaceRole.OWNER) {
      throw new ForbiddenException('Invalid invitation role.');
    }
    const { workspaceId } = invitation;

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.workspaceMembership.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
      });
      if (existing?.status === MembershipStatus.ACTIVE) {
        throw new ConflictException({
          code: 'ALREADY_MEMBER',
          message: 'You are already a member of this workspace.',
        });
      }
      const consumed = await tx.workspaceInvitation.updateMany({
        where: {
          id: invitation.id,
          tokenHash: invitation.tokenHash,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { acceptedAt: now, acceptedById: userId },
      });
      if (consumed.count !== 1) {
        throw new GoneException({
          code: 'INVITATION_USED',
          message: 'This invitation has already been used or was revoked.',
        });
      }
      const membership = {
        role: invitation.role,
        status: MembershipStatus.ACTIVE,
        invitedById: invitation.invitedById,
        joinedAt: now,
        invitationExpiresAt: null,
      };
      if (existing) {
        // A legacy pending/expired membership row is activated in place.
        await tx.workspaceMembership.update({
          where: { id: existing.id },
          data: membership,
        });
      } else {
        await tx.workspaceMembership.create({
          data: { workspaceId, userId, ...membership },
        });
      }
    });

    await this.audit.log({
      workspaceId,
      actorId: userId,
      entityType: 'INVITATION',
      entityId: invitation.id,
      action: 'INVITATION_ACCEPTED',
      metadata: { role: invitation.role },
    });
    return {
      message: 'Invitation accepted.',
      workspace: {
        id: invitation.workspace.id,
        name: invitation.workspace.name,
        slug: invitation.workspace.slug,
      },
      role: invitation.role,
    };
  }
}
