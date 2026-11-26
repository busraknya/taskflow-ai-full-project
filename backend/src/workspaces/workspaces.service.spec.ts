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
    prisma.workspaceMembership.findUnique.mockResolvedValueOnce({
      role: WorkspaceRole.OWNER,
      status: MembershipStatus.ACTIVE,
    });
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

    await expect(
      service.acceptInvitation('workspace-1', 'invitee-1'),
    ).resolves.toEqual({ message: 'Workspace daveti kabul edildi.' });

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
    ).resolves.toEqual({ message: 'Workspace daveti reddedildi.' });

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

  it('returns the same response for unregistered addresses and creates nothing', async () => {
    prisma.workspaceMembership.findUnique.mockResolvedValueOnce(
      ownerMembership,
    );
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.inviteMember(
      'workspace-1',
      'owner-1',
      'Nobody@Example.com',
      WorkspaceRole.MEMBER,
    );

    expect(result).toEqual({
      message: 'Davet oluşturuldu.',
      email: 'nobody@example.com',
      role: WorkspaceRole.MEMBER,
      invitationExpiresAt: expect.any(Date) as Date,
    });
    expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
    expect(prisma.workspaceMembership.updateMany).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('never discloses the invitee profile in the invite response', async () => {
    prisma.workspaceMembership.findUnique
      .mockResolvedValueOnce(ownerMembership)
      .mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValue({
      id: 'invitee-1',
      email: 'new@example.com',
      fullName: 'Secret Name',
      deletedAt: null,
      disabledAt: null,
    });
    prisma.workspaceMembership.create.mockResolvedValue({});
    prisma.workspace.findUnique.mockResolvedValue({ name: 'Team' });

    const registered = await service.inviteMember(
      'workspace-1',
      'owner-1',
      'new@example.com',
      WorkspaceRole.MEMBER,
    );

    // Same shape as for an unknown address; no id, name or membership row.
    expect(Object.keys(registered).sort()).toEqual(
      ['email', 'invitationExpiresAt', 'message', 'role'].sort(),
    );
    expect(JSON.stringify(registered)).not.toContain('Secret Name');
    expect(JSON.stringify(registered)).not.toContain('invitee-1');
  });

  it('treats deleted or disabled accounts like unknown addresses', async () => {
    for (const blocked of [
      { deletedAt: new Date() },
      { disabledAt: new Date() },
    ]) {
      jest.resetAllMocks();
      prisma.workspaceMembership.findUnique.mockResolvedValueOnce(
        ownerMembership,
      );
      prisma.user.findUnique.mockResolvedValue({
        id: 'invitee-1',
        email: 'gone@example.com',
        deletedAt: null,
        disabledAt: null,
        ...blocked,
      });

      await expect(
        service.inviteMember(
          'workspace-1',
          'owner-1',
          'gone@example.com',
          WorkspaceRole.MEMBER,
        ),
      ).resolves.toMatchObject({ message: 'Davet oluşturuldu.' });
      expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
      expect(events.emit).not.toHaveBeenCalled();
    }
  });

  it('maps a concurrent duplicate invitation (P2002) to 409 without leaking internals', async () => {
    prisma.workspaceMembership.findUnique
      .mockResolvedValueOnce(ownerMembership)
      .mockResolvedValueOnce(null);
    prisma.user.findUnique.mockResolvedValue({
      id: 'invitee-1',
      email: 'new@example.com',
      deletedAt: null,
      disabledAt: null,
    });
    prisma.workspaceMembership.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`workspaceId`,`userId`)',
        { code: 'P2002', clientVersion: 'test' },
      ),
    );

    const attempt = service.inviteMember(
      'workspace-1',
      'owner-1',
      'new@example.com',
      WorkspaceRole.MEMBER,
    );
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.not.toThrow(/Unique constraint/);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('re-invites from an expired invitation only through a conditional write', async () => {
    prisma.workspaceMembership.findUnique
      .mockResolvedValueOnce(ownerMembership)
      .mockResolvedValueOnce({
        id: 'membership-1',
        status: MembershipStatus.EXPIRED,
        invitationExpiresAt: new Date(Date.now() - 1_000),
      });
    prisma.user.findUnique.mockResolvedValue({
      id: 'invitee-1',
      email: 'new@example.com',
      deletedAt: null,
      disabledAt: null,
    });
    prisma.workspaceMembership.updateMany.mockResolvedValue({ count: 1 });
    prisma.workspace.findUnique.mockResolvedValue({ name: 'Team' });

    await service.inviteMember(
      'workspace-1',
      'owner-1',
      'new@example.com',
      WorkspaceRole.VIEWER,
    );

    const [call] = prisma.workspaceMembership.updateMany.mock.calls[0] as [
      {
        where: { id: string; OR: unknown[] };
        data: { status: MembershipStatus };
      },
    ];
    expect(call.where.id).toBe('membership-1');
    // The predicate only matches expired/stale invitations, never ACTIVE.
    expect(JSON.stringify(call.where)).not.toContain(MembershipStatus.ACTIVE);
    expect(call.where.OR).toEqual([
      { status: MembershipStatus.EXPIRED },
      {
        status: MembershipStatus.PENDING,
        OR: [
          { invitationExpiresAt: null },
          { invitationExpiresAt: { lte: expect.any(Date) as Date } },
        ],
      },
    ]);
    expect(call.data.status).toBe(MembershipStatus.PENDING);
    expect(events.emit).toHaveBeenCalledTimes(1);
  });

  it('refuses to re-invite when the invitation changed concurrently', async () => {
    prisma.workspaceMembership.findUnique
      .mockResolvedValueOnce(ownerMembership)
      .mockResolvedValueOnce({
        id: 'membership-1',
        status: MembershipStatus.EXPIRED,
        invitationExpiresAt: null,
      });
    prisma.user.findUnique.mockResolvedValue({
      id: 'invitee-1',
      email: 'new@example.com',
      deletedAt: null,
      disabledAt: null,
    });
    // e.g. a parallel re-invite already moved it back to PENDING.
    prisma.workspaceMembership.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.inviteMember(
        'workspace-1',
        'owner-1',
        'new@example.com',
        WorkspaceRole.MEMBER,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(events.emit).not.toHaveBeenCalled();
  });

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
