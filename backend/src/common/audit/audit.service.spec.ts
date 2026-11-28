import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService logging', () => {
  const prisma = { auditLogEntry: { create: jest.fn() } };
  const service = new AuditService(prisma as unknown as PrismaService);
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('does not log when the audit entry is written', async () => {
    prisma.auditLogEntry.create.mockResolvedValue({});
    await service.log({
      workspaceId: 'ws-1',
      actorId: 'user-1',
      entityType: 'COMMENT',
      entityId: 'comment-1',
      action: 'COMMENT_CREATED',
      metadata: { bodySnippet: 'hello' },
    });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('logs a write failure without metadata or the Prisma message, and does not throw', async () => {
    prisma.auditLogEntry.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Invalid `prisma.auditLogEntry.create()` invocation: metadata: { bodySnippet: "call alice@example.com" }',
        { code: 'P2003', clientVersion: 'test' },
      ),
    );

    await expect(
      service.log({
        workspaceId: 'ws-1',
        actorId: 'user-1',
        entityType: 'COMMENT',
        entityId: 'comment-1',
        action: 'COMMENT_CREATED',
        metadata: { bodySnippet: 'call alice@example.com' },
      }),
    ).resolves.toBeUndefined();

    const logged = errorLog.mock.calls.flat().map(String).join('\n');
    expect(logged).toContain(
      'Failed to write audit log (COMMENT COMMENT_CREATED, entity comment-1): PrismaClientKnownRequestError (code=P2003)',
    );
    expect(logged).not.toContain('alice@example.com');
    expect(logged).not.toContain('bodySnippet');
    expect(logged).not.toContain('prisma.auditLogEntry.create');
  });
});
