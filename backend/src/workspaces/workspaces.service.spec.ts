import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { MembershipStatus, Prisma, WorkspaceRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from './workspaces.service';

jest.mock('@nestjs/event-emitter', () => ({
  EventEmitter2: class EventEmitter2 {
    emit = jest.fn();
  },
}));

describe('WorkspacesService invitations', () => {
  const prisma = {
    workspaceMembership: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    workspace: {
      findUnique: jest.fn(),
    },
  };
  const events = { emit: jest.fn() };
  const service = new WorkspacesService(
    prisma as unknown as PrismaService,
    events as unknown as EventEmitter2,
  );

  beforeEach(() => jest.resetAllMocks());

  it('accepts a pending invitation only for the authenticated user', async () => {
    prisma.workspaceMembership.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.acceptInvitation('workspace-1', 'invitee-1'),
    ).resolves.toEqual({ message: 'Workspace invitation accepted.' });

    expect(prisma.workspaceMembership.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        userId: 'invitee-1',
        status: MembershipStatus.PENDING,
        invitationExpiresAt: { gt: expect.any(Date) },
        role: { not: WorkspaceRole.OWNER },
        workspace: { deletedAt: null },
      },
      data: {
        status: MembershipStatus.ACTIVE,
        joinedAt: expect.any(Date),
        invitationExpiresAt: null,
      },
    });
  });

  it('expires an overdue invitation instead of accepting it', async () => {
    prisma.workspaceMembership.updateMany.mockResolvedValue({ count: 0 });
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      id: 'membership-1',
      status: MembershipStatus.PENDING,
      invitationExpiresAt: new Date(Date.now() - 60_000),
    });
    prisma.workspaceMembership.update.mockResolvedValue({});

    await expect(
      service.acceptInvitation('workspace-1', 'invitee-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.workspaceMembership.update).toHaveBeenCalledWith({
      where: { id: 'membership-1' },
      data: { status: MembershipStatus.EXPIRED },
    });
  });

  it('does not allow accepting an invitation for another user', async () => {
    prisma.workspaceMembership.updateMany.mockResolvedValue({ count: 0 });
    prisma.workspaceMembership.findUnique.mockResolvedValue(null);

    await expect(
      service.acceptInvitation('workspace-1', 'other-user'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows the invited user to decline their own pending invitation', async () => {
    prisma.workspaceMembership.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      service.declineInvitation('workspace-1', 'invitee-1'),
    ).resolves.toEqual({ message: 'Workspace invitation declined.' });

    expect(prisma.workspaceMembership.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        userId: 'invitee-1',
        status: MembershipStatus.PENDING,
      },
    });
  });

  // ---------- SEC-05: enumeration, PII and concurrency ----------

  const ownerMembership = {
    role: WorkspaceRole.OWNER,
    status: MembershipStatus.ACTIVE,
  };

  it('rejects accepting an invitation for a deleted workspace', async () => {
    prisma.workspaceMembership.updateMany.mockResolvedValue({ count: 0 });
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      id: 'membership-1',
      status: MembershipStatus.PENDING,
      invitationExpiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.acceptInvitation('workspace-1', 'invitee-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workspaceMembership.update).not.toHaveBeenCalled();
  });

  it('hides the profile of pending invitees in the member list', async () => {
    prisma.workspaceMembership.updateMany.mockResolvedValue({ count: 0 });
    prisma.workspaceMembership.findMany.mockResolvedValue([
      {
        id: 'm-1',
        status: MembershipStatus.ACTIVE,
        role: WorkspaceRole.OWNER,
        user: {
          id: 'u-1',
          email: 'owner@example.com',
          fullName: 'Owner',
          avatarUrl: 'a.png',
        },
      },
      {
        id: 'm-2',
        status: MembershipStatus.PENDING,
        role: WorkspaceRole.MEMBER,
        user: {
          id: 'u-2',
          email: 'invitee@example.com',
          fullName: 'Hidden Name',
          avatarUrl: 'b.png',
        },
      },
    ]);

    const members = await service.getWorkspaceMembers('workspace-1');

    expect(members[0].user.fullName).toBe('Owner');
    expect(members[1].user).toEqual({
      id: 'u-2',
      email: 'invitee@example.com',
      fullName: null,
      avatarUrl: null,
    });
  });

  it('lists pending invitations only for workspaces that still exist', async () => {
    prisma.workspaceMembership.updateMany.mockResolvedValue({ count: 0 });
    prisma.workspaceMembership.findMany.mockResolvedValue([]);

    await service.getPendingInvitations('invitee-1');

    expect(prisma.workspaceMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'invitee-1',
          status: MembershipStatus.PENDING,
          workspace: { deletedAt: null },
        },
      }),
    );
  });
});
