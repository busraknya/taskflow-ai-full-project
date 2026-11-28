/* eslint-disable @typescript-eslint/no-unsafe-assignment -- jest asymmetric matchers (expect.objectContaining/any) are typed as any */
import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuditService } from '../common/audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { InvitationsService } from './invitations.service';

const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const future = () => new Date(Date.now() + 86_400_000);

describe('InvitationsService', () => {
  const prisma = {
    workspaceMembership: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    workspaceInvitation: {
      updateMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    workspace: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((cb: (tx: typeof prisma) => unknown) =>
    cb(prisma),
  );
  const events = { emit: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new InvitationsService(
    prisma as unknown as PrismaService,
    events as unknown as EventEmitter2,
    audit as unknown as AuditService,
  );
  const originalHost = process.env.SMTP_HOST;
  const originalFrontend = process.env.FRONTEND_URL;

  const asRole = (role: string) =>
    prisma.workspaceMembership.findUnique.mockResolvedValue({
      role,
      status: 'ACTIVE',
    });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'https://app.example.com/';
    process.env.SMTP_HOST = '';
    asRole('OWNER');
    prisma.workspaceMembership.findFirst.mockResolvedValue(null);
    prisma.workspaceInvitation.updateMany.mockResolvedValue({ count: 0 });
    prisma.workspaceInvitation.create.mockImplementation(
      ({ data }: { data: object }) => Promise.resolve({ id: 'inv-1', ...data }),
    );
    prisma.workspace.findUnique.mockResolvedValue({ name: 'Design' });
    prisma.user.findUnique.mockResolvedValue({ fullName: 'Ada' });
  });

  afterAll(() => {
    process.env.SMTP_HOST = originalHost;
    process.env.FRONTEND_URL = originalFrontend;
  });

  describe('create', () => {
    it('invites any address, stores only the token hash and returns a fragment link', async () => {
      const result = await service.create(
        'ws',
        'owner',
        '  New.Person@Example.com ',
        'MEMBER',
      );
      const data = (
        prisma.workspaceInvitation.create.mock.calls[0] as [
          { data: Record<string, unknown> },
        ]
      )[0].data;
      const token = result.acceptUrl.split('#')[1];

      expect(result).toMatchObject({
        message: 'Invitation created.',
        email: 'new.person@example.com',
        role: 'MEMBER',
        emailDelivery: 'disabled',
      });
      expect(result.acceptUrl).toBe(`https://app.example.com/invite#${token}`);
      expect(token.length).toBeGreaterThanOrEqual(43); // 256-bit base64url
      expect(data.tokenHash).toBe(sha(token));
      expect(JSON.stringify(data)).not.toContain(token);
      expect(data.email).toBe('new.person@example.com');
      expect(events.emit).toHaveBeenCalledWith(
        'workspace.invitation_created',
        expect.objectContaining({
          email: 'new.person@example.com',
          inviterName: 'Ada',
          acceptUrl: result.acceptUrl,
        }),
      );
    });

    it('reports queued delivery when SMTP is configured', async () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      const result = await service.create(
        'ws',
        'owner',
        'a@example.com',
        'MEMBER',
      );
      expect(result.emailDelivery).toBe('queued');
    });

    it('does not look up accounts: the response is the same for any address', async () => {
      const result = await service.create(
        'ws',
        'owner',
        'someone@example.com',
        'VIEWER',
      );
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1); // the inviter's name only
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'owner' },
        select: { fullName: true },
      });
      expect(Object.keys(result).sort()).toEqual([
        'acceptUrl',
        'email',
        'emailDelivery',
        'invitationExpiresAt',
        'invitationId',
        'message',
        'role',
      ]);
    });

    it('revokes an expired open invitation before issuing a new one', async () => {
      await service.create('ws', 'owner', 'a@example.com', 'MEMBER');
      expect(prisma.workspaceInvitation.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          workspaceId: 'ws',
          email: 'a@example.com',
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { lte: expect.any(Date) },
        }),
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('maps a concurrent duplicate (unique index) to 409', async () => {
      prisma.workspaceInvitation.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );
      await expect(
        service.create('ws', 'owner', 'a@example.com', 'MEMBER'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(events.emit).not.toHaveBeenCalled();
    });

    it('rejects addresses that already belong to an active member', async () => {
      prisma.workspaceMembership.findFirst.mockResolvedValue({ id: 'm1' });
      await expect(
        service.create('ws', 'owner', 'a@example.com', 'MEMBER'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it.each([
      ['MEMBER', 'VIEWER'],
      ['VIEWER', 'VIEWER'],
      ['ADMIN', 'ADMIN'],
      ['OWNER', 'OWNER'],
    ])('a %s cannot grant %s', async (actor, role) => {
      asRole(actor);
      await expect(
        service.create('ws', 'u', 'a@example.com', role as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.workspaceInvitation.create).not.toHaveBeenCalled();
    });
  });

  describe('accept', () => {
    const invitation = (overrides: object = {}) => ({
      id: 'inv-1',
      workspaceId: 'ws',
      email: 'a@example.com',
      role: 'MEMBER',
      tokenHash: sha('t'.repeat(43)),
      invitedById: 'owner',
      expiresAt: future(),
      acceptedAt: null,
      revokedAt: null,
      workspace: { id: 'ws', name: 'Design', slug: 'design', deletedAt: null },
      invitedBy: { fullName: 'Ada' },
      ...overrides,
    });
    const TOKEN = 't'.repeat(43);

    beforeEach(() => {
      prisma.workspaceInvitation.findUnique.mockResolvedValue(invitation());
      prisma.workspaceMembership.findUnique.mockResolvedValue(null);
      prisma.workspaceInvitation.updateMany.mockResolvedValue({ count: 1 });
    });

    it('looks the invitation up by token hash and creates an active membership', async () => {
      const result = await service.accept(TOKEN, 'user-2');
      expect(prisma.workspaceInvitation.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: sha(TOKEN) } }),
      );
      expect(prisma.workspaceMembership.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws',
          userId: 'user-2',
          role: 'MEMBER',
          status: 'ACTIVE',
        }),
      });
      expect(result.workspace.slug).toBe('design');
    });

    it('activates a legacy pending membership in place', async () => {
      prisma.workspaceMembership.findUnique.mockResolvedValue({
        id: 'm-legacy',
        status: 'PENDING',
      });
      await service.accept(TOKEN, 'user-2');
      expect(prisma.workspaceMembership.update).toHaveBeenCalledWith({
        where: { id: 'm-legacy' },
        data: expect.objectContaining({ status: 'ACTIVE', role: 'MEMBER' }),
      });
    });

    it.each([
      ['unknown token', null, NotFoundException],
      [
        'deleted workspace',
        invitation({
          workspace: { id: 'ws', name: 'x', slug: 'x', deletedAt: new Date() },
        }),
        NotFoundException,
      ],
      [
        'used invitation',
        invitation({ acceptedAt: new Date() }),
        GoneException,
      ],
      [
        'revoked invitation',
        invitation({ revokedAt: new Date() }),
        GoneException,
      ],
      [
        'expired invitation',
        invitation({ expiresAt: new Date(Date.now() - 1000) }),
        GoneException,
      ],
    ])('rejects a %s', async (_label, value, error) => {
      prisma.workspaceInvitation.findUnique.mockResolvedValue(value);
      await expect(service.accept(TOKEN, 'user-2')).rejects.toBeInstanceOf(
        error,
      );
      expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
    });

    it('rejects users who are already members without consuming the invitation', async () => {
      prisma.workspaceMembership.findUnique.mockResolvedValue({
        id: 'm',
        status: 'ACTIVE',
      });
      await expect(service.accept(TOKEN, 'user-2')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.workspaceInvitation.updateMany).not.toHaveBeenCalled();
    });

    it('loses a concurrent race without creating a membership', async () => {
      prisma.workspaceInvitation.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.accept(TOKEN, 'user-2')).rejects.toBeInstanceOf(
        GoneException,
      );
      expect(prisma.workspaceMembership.create).not.toHaveBeenCalled();
    });

    it('never grants ownership', async () => {
      prisma.workspaceInvitation.findUnique.mockResolvedValue(
        invitation({ role: 'OWNER' }),
      );
      await expect(service.accept(TOKEN, 'user-2')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
