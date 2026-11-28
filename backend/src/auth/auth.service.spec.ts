import { createHash } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { getRequiredJwtSecret } from './jwt-config';
import { REFRESH_REUSE_GRACE_MS } from './refresh-token.util';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// Keep this unit test isolated from Nest packages that ship ESM entry points.
jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));
jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

/**
 * Unit tests for refresh-token handling with mocked Prisma. Refresh tokens
 * are opaque random values looked up by their SHA-256 hash; every
 * session-changing operation runs under the per-user row lock.
 * HTTP-level and PostgreSQL behaviour is covered by auth-session.spec.ts and
 * test/auth-session.e2e-spec.ts.
 */
describe('AuthService refresh token rotation', () => {
  const lockedUser = {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'password-hash',
    blocked: false,
  };
  const activeToken = {
    id: 'refresh-1',
    userId: 'user-1',
    tokenHash: sha256('current-refresh-token'),
    familyId: 'family-1',
    replacedByTokenId: null as string | null,
    revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + 60_000),
  };

  const tx = {
    $queryRaw: jest.fn(),
    refreshToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const jwt = { sign: jest.fn(), verify: jest.fn() };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jwt.sign.mockReturnValue('next-access-token');
    prisma.$transaction.mockImplementation(
      (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    prisma.refreshToken.findUnique.mockResolvedValue({ userId: 'user-1' });
    tx.$queryRaw.mockResolvedValue([lockedUser]);
    tx.refreshToken.findUnique.mockResolvedValue({ ...activeToken });
    tx.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    tx.refreshToken.create.mockResolvedValue({ id: 'refresh-2' });
    tx.refreshToken.update.mockResolvedValue({});
  });

  it('rejects a missing JWT secret before issuing tokens', () => {
    const config = { get: jest.fn().mockReturnValue(undefined) };
    expect(() =>
      getRequiredJwtSecret(config as unknown as ConfigService),
    ).toThrow('JWT_SECRET must contain at least 32 bytes');
  });

  it('rejects a weak JWT secret before issuing tokens', () => {
    const config = { get: jest.fn().mockReturnValue('too-short') };
    expect(() =>
      getRequiredJwtSecret(config as unknown as ConfigService),
    ).toThrow('JWT_SECRET must contain at least 32 bytes');
  });

  it('rejects legacy (pre-opaque) refresh tokens without bcrypt scanning', async () => {
    // Legacy JWT/bcrypt sessions are revoked by the session_security
    // migration and are intentionally no longer accepted.
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(
      service.refreshTokens('legacy.jwt.refresh-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses the unique SHA-256 fingerprint index and rotates under the user lock', async () => {
    const result = await service.refreshTokens('current-refresh-token');

    expect(result.accessToken).toBe('next-access-token');
    expect(result.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.refreshToken).not.toBe('current-refresh-token');

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: sha256('current-refresh-token') },
      select: { userId: true },
    });
    // Lock first, then the authoritative re-read of the token.
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.refreshToken.findUnique.mock.invocationCallOrder[0],
    );
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'refresh-1',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) as Date },
      },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(tx.refreshToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        familyId: 'family-1',
        tokenHash: sha256(result.refreshToken),
        expiresAt: expect.any(Date) as Date,
      },
    });
    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('rejects a concurrent rotation loser without creating another token', async () => {
    // Under the lock the loser re-reads a token the winner just rotated.
    tx.refreshToken.findUnique.mockResolvedValue({
      ...activeToken,
      revokedAt: new Date(),
      replacedByTokenId: 'refresh-2',
    });

    await expect(
      service.refreshTokens('current-refresh-token'),
    ).rejects.toMatchObject({
      response: { code: 'REFRESH_TOKEN_ROTATED' },
    });

    expect(tx.refreshToken.create).not.toHaveBeenCalled();
    expect(tx.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('detects reuse of a revoked token and revokes its session family', async () => {
    tx.refreshToken.findUnique.mockResolvedValue({
      ...activeToken,
      revokedAt: new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1_000),
      replacedByTokenId: 'refresh-2',
    });

    await expect(
      service.refreshTokens('current-refresh-token'),
    ).rejects.toMatchObject({ response: { code: 'REFRESH_TOKEN_REUSED' } });

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects access tokens presented to the refresh endpoint', async () => {
    // An access token (JWT) has no stored hash, so it is unknown.
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(
      service.refreshTokens('eyJhbGciOiJIUzI1NiJ9.access.token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects refresh for a deleted or disabled account and revokes its sessions', async () => {
    tx.$queryRaw.mockResolvedValue([{ ...lockedUser, blocked: true }]);

    await expect(
      service.refreshTokens('current-refresh-token'),
    ).rejects.toMatchObject({ response: { code: 'INVALID_REFRESH_TOKEN' } });

    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(tx.refreshToken.create).not.toHaveBeenCalled();
  });

  it('normalizes unknown tokens with one indexed lookup and no lock', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.refreshTokens('invalid-token')).rejects.toMatchObject({
      response: { code: 'INVALID_REFRESH_TOKEN' },
    });
    expect(prisma.refreshToken.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('logs out through the indexed fingerprint lookup and revokes the family', async () => {
    await expect(
      service.logoutWithRefreshToken('current-refresh-token'),
    ).resolves.toEqual({ message: 'Logged out successfully.' });

    expect(prisma.refreshToken.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: sha256('current-refresh-token') },
      select: { userId: true },
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { familyId: 'family-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
  });

  it('rejects mobile logout with an unknown refresh token', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue(null);

    await expect(
      service.logoutWithRefreshToken('unknown-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
