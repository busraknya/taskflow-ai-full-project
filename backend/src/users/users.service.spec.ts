import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthService } from '../auth/auth.service';
import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('UsersService password changes', () => {
  const transactionClient = {
    user: { update: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    notificationPreference: { findMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(
      (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    ),
  };
  const authService = {
    lockUser: jest.fn(),
    revokeAllForUser: jest.fn(),
    issueSession: jest.fn(),
  };
  const service = new UsersService(
    prisma as unknown as PrismaService,
    authService as unknown as AuthService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: 'old-hash',
      deletedAt: null,
      disabledAt: null,
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    authService.lockUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: 'old-hash',
      blocked: false,
    });
    authService.revokeAllForUser.mockResolvedValue(undefined);
    authService.issueSession.mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });
    transactionClient.user.update.mockResolvedValue({});
  });

  it('updates the password and revokes all active refresh sessions in one locked transaction', async () => {
    await expect(
      service.changePassword('user-1', {
        currentPassword: 'old-password',
        newPassword: 'new-password1',
      }),
    ).resolves.toEqual({
      message: 'Şifreniz başarıyla değiştirildi.',
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // The per-user lock is taken before anything is written.
    expect(authService.lockUser).toHaveBeenCalledWith(
      transactionClient,
      'user-1',
    );
    expect(authService.lockUser.mock.invocationCallOrder[0]).toBeLessThan(
      transactionClient.user.update.mock.invocationCallOrder[0],
    );
    expect(transactionClient.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        passwordHash: 'new-hash',
        passwordChangedAt: expect.any(Date) as Date,
      },
    });
    expect(authService.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      transactionClient,
    );
    // The caller's fresh session is created inside the same transaction,
    // after the revocation.
    expect(authService.issueSession).toHaveBeenCalledWith(
      transactionClient,
      'user-1',
      'user@example.com',
    );
    expect(
      authService.revokeAllForUser.mock.invocationCallOrder[0],
    ).toBeLessThan(authService.issueSession.mock.invocationCallOrder[0]);
  });

  it('does not change the password or revoke sessions when the current password is wrong', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.changePassword('user-1', {
        currentPassword: 'wrong-password',
        newPassword: 'new-password1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('aborts without writing when the password changed concurrently', async () => {
    authService.lockUser.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: 'changed-by-another-request',
      blocked: false,
    });

    await expect(
      service.changePassword('user-1', {
        currentPassword: 'old-password',
        newPassword: 'new-password1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(transactionClient.user.update).not.toHaveBeenCalled();
    expect(authService.revokeAllForUser).not.toHaveBeenCalled();
    expect(authService.issueSession).not.toHaveBeenCalled();
  });
});
