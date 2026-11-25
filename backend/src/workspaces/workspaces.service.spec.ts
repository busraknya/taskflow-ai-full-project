import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { MembershipStatus, WorkspaceRole } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { WorkspacesService } from './workspaces.service';

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

  beforeEach(() => jest.clearAllMocks());

  it('does not allow an ADMIN to grant OWNER', async () => {
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      role: WorkspaceRole.ADMIN,
      status: MembershipStatus.ACTIVE,
    });

    await expect(
      service.inviteMember(
        'workspace-1',
        'admin-1',
        'owner@example.com',
        WorkspaceRole.OWNER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
  });

  it('does not allow an ADMIN to grant ADMIN', async () => {
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      role: WorkspaceRole.ADMIN,
      status: MembershipStatus.ACTIVE,
    });

    await expect(
      service.inviteMember(
        'workspace-1',
        'admin-1',
        'admin@example.com',
        WorkspaceRole.ADMIN,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
  });

  it('does not allow a MEMBER to invite users', async () => {
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      role: WorkspaceRole.MEMBER,
      status: MembershipStatus.ACTIVE,
    });

    await expect(
      service.inviteMember(
        'workspace-1',
        'member-1',
        'new@example.com',
        WorkspaceRole.MEMBER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a pending invitation that expires after seven days', async () => {
    prisma.workspaceMembership.findUnique
      .mockResolvedValueOnce({
        role: WorkspaceRole.OWNER,
        status: MembershipStatus.ACTIVE,
      })
      .mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValue({
      id: 'invitee-1',
      email: 'new@example.com',
      fullName: 'New User',
    });
    prisma.workspaceMembership.create.mockResolvedValue({
      id: 'membership-1',
      status: MembershipStatus.PENDING,
    });
    prisma.workspace.findUnique.mockResolvedValue({ name: 'Team Workspace' });

    await service.inviteMember(
      'workspace-1',
      'owner-1',
      ' NEW@example.com ',
      WorkspaceRole.MEMBER,
    );

    const createCall = prisma.workspaceMembership.create.mock.calls[0][0];
    expect(createCall.data.email).toBeUndefined();
    expect(createCall.data.status).toBe(MembershipStatus.PENDING);
    expect(createCall.data.invitedById).toBe('owner-1');
    expect(createCall.data.joinedAt).toBeNull();
    expect(createCall.data.invitationExpiresAt.getTime()).toBeGreaterThan(
      Date.now() + 6 * 24 * 60 * 60 * 1000,
    );
    expect(createCall.data.invitationExpiresAt.getTime()).toBeLessThan(
      Date.now() + 8 * 24 * 60 * 60 * 1000,
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'new@example.com' },
    });
    expect(events.emit).toHaveBeenCalledWith(
      'workspace.member_invited',
      expect.objectContaining({ email: 'new@example.com' }),
    );
  });

  it('rejects self-invitations', async () => {
    prisma.workspaceMembership.findUnique
      .mockResolvedValueOnce({
        role: WorkspaceRole.OWNER,
        status: MembershipStatus.ACTIVE,
      })
      .mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@example.com',
    });

    await expect(
      service.inviteMember(
        'workspace-1',
        'owner-1',
        'owner@example.com',
        WorkspaceRole.MEMBER,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
  });

  it('accepts a pending invitation only for the authenticated user', async () => {
    prisma.workspaceMembership.updateMany.mockResolvedValue({ count: 1 });
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      id: 'membership-1',
      status: MembershipStatus.ACTIVE,
      workspace: { id: 'workspace-1' },
    });

    await expect(
      service.acceptInvitation('workspace-1', 'invitee-1'),
    ).resolves.toMatchObject({ status: MembershipStatus.ACTIVE });

    expect(prisma.workspaceMembership.updateMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        userId: 'invitee-1',
        status: MembershipStatus.PENDING,
        invitationExpiresAt: { gt: expect.any(Date) },
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
    ).resolves.toEqual({ message: 'Workspace daveti reddedildi.' });

    expect(prisma.workspaceMembership.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId: 'workspace-1',
        userId: 'invitee-1',
        status: MembershipStatus.PENDING,
      },
    });
  });
});
