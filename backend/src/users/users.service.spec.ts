import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('UsersService password changes', () => {
  const transactionClient = {
    user: { update: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    notificationPreference: { findMany: jest.fn(), upsert: jest.fn() },
    $transaction: jest.fn(async (callback: (tx: typeof transactionClient) => unknown) =>
      callback(transactionClient),
    ),
  };
  const service = new UsersService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      passwordHash: 'old-hash',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
    transactionClient.user.update.mockResolvedValue({});
    transactionClient.refreshToken.updateMany.mockResolvedValue({ count: 2 });
  });

  it('updates the password and revokes all active refresh sessions in one transaction', async () => {
    await expect(
      service.changePassword('user-1', {
        currentPassword: 'old-password',
        newPassword: 'new-password1',
      }),
    ).resolves.toEqual({
      message: 'Şifreniz başarıyla değiştirildi. Lütfen yeni şifrenizle tekrar giriş yapın.',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(transactionClient.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: 'new-hash' },
    });
    expect(transactionClient.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
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
});
