import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ForbiddenException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { WorkspacesService } from './workspaces.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('@nestjs/event-emitter', () => ({
  EventEmitter2: class EventEmitter2 {
    emit = jest.fn();
  },
}));

describe('WorkspacesService invitation role policy', () => {
  const prisma = {
    workspaceMembership: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    workspace: {
      findUnique: jest.fn(),
    },
  };
  const events = { emit: jest.fn() };
  const service = new WorkspacesService(prisma as unknown as PrismaService, events as unknown as EventEmitter2);

  beforeEach(() => jest.clearAllMocks());

  it('does not allow an ADMIN to grant OWNER', async () => {
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      role: WorkspaceRole.ADMIN,
    });

    await expect(
      service.inviteMember('workspace-1', 'admin-1', 'owner@example.com', WorkspaceRole.OWNER),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
  });

  it('does not allow an ADMIN to grant ADMIN', async () => {
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      role: WorkspaceRole.ADMIN,
    });

    await expect(
      service.inviteMember('workspace-1', 'admin-1', 'admin@example.com', WorkspaceRole.ADMIN),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
  });

  it('does not allow a MEMBER to invite users', async () => {
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      role: WorkspaceRole.MEMBER,
    });

    await expect(
      service.inviteMember('workspace-1', 'member-1', 'new@example.com', WorkspaceRole.MEMBER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not allow OWNER assignment through ordinary role updates', async () => {
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      role: WorkspaceRole.OWNER,
    });

    await expect(
      service.updateMemberRole(
        'workspace-1',
        'owner-1',
        'membership-2',
        WorkspaceRole.OWNER,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.workspaceMembership.findUnique).toHaveBeenCalledTimes(1);
  });

});
