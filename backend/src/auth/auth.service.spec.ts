import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { JwtService } from '@nestjs/jwt';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// Keep this unit test isolated from Nest packages that ship ESM entry points.
jest.mock('@nestjs/jwt', () => ({ JwtService: class JwtService {} }));
jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));

describe('AuthService refresh token rotation', () => {
  const now = new Date();
  const transactionClient = {
    refreshToken: {
      updateMany: jest.fn(),
      create: jest.fn(),
    },
  };
  const prisma = {
    user: { findUnique: jest.fn(), create: jest.fn() },
    refreshToken: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    ),
  };
  const jwt = {
    verify: jest.fn(),
    sign: jest.fn(),
  };
  const config = { get: jest.fn().mockReturnValue('test-secret-value-with-at-least-32-bytes') };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    config.get.mockReturnValue('test-secret-value-with-at-least-32-bytes');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('next-token-hash');
    jwt.sign.mockReturnValueOnce('next-access-token').mockReturnValueOnce('next-refresh-token');
    jwt.verify.mockReturnValue({ sub: 'user-1', email: 'user@example.com', tokenType: 'refresh' });
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: null });
    prisma.refreshToken.findMany.mockResolvedValue([
      {
        id: 'refresh-1',
        tokenHash: 'stored-hash',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    transactionClient.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    transactionClient.refreshToken.create.mockResolvedValue({});
  });

  it('rejects a missing JWT secret before issuing tokens', async () => {
    config.get.mockReturnValue(undefined);
    const secretAccessor = service as unknown as { getJwtSecret: () => string };

    expect(() => secretAccessor.getJwtSecret()).toThrow(
      'JWT_SECRET must contain at least 32 bytes',
    );
  });

  it('rejects a weak JWT secret before issuing tokens', async () => {
    config.get.mockReturnValue('too-short');
    const secretAccessor = service as unknown as { getJwtSecret: () => string };

    expect(() => secretAccessor.getJwtSecret()).toThrow(
      'JWT_SECRET must contain at least 32 bytes',
    );
  });

  it('atomically revokes the current token and stores its replacement', async () => {
    await expect(service.refreshTokens('current-refresh-token')).resolves.toEqual({
      accessToken: 'next-access-token',
      refreshToken: 'next-refresh-token',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'refresh-1',
        userId: 'user-1',
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) as Date },
      },
      data: { revokedAt: expect.any(Date) as Date },
    });
    expect(transactionClient.refreshToken.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        tokenHash: 'next-token-hash',
        expiresAt: expect.any(Date) as Date,
      },
    });
  });

  it('rejects a concurrent rotation loser without creating another token', async () => {
    transactionClient.refreshToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.refreshTokens('current-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(transactionClient.refreshToken.create).not.toHaveBeenCalled();
  });

  it('rejects a previously rotated token and revokes remaining active sessions', async () => {
    prisma.refreshToken.findMany.mockResolvedValue([
      {
        id: 'refresh-1',
        tokenHash: 'stored-hash',
        revokedAt: now,
        expiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    await expect(service.refreshTokens('reused-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });


  it('rejects access tokens presented to the refresh endpoint', async () => {
    jwt.verify.mockReturnValue({ sub: 'user-1', email: 'user@example.com', tokenType: 'access' });

    await expect(service.refreshTokens('access-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
  });

  it('rejects refresh for a deleted account', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', deletedAt: new Date() });

    await expect(service.refreshTokens('refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
  });

  it('normalizes invalid JWTs without querying stored tokens', async () => {
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await expect(service.refreshTokens('invalid-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.refreshToken.findMany).not.toHaveBeenCalled();
  });
});
