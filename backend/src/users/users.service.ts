import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
  ) {}

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
    });
  }

  async updatePreference(userId: string, category: string, emailEnabled: boolean) {
    return this.prisma.notificationPreference.upsert({
      where: {
        userId_category: {
          userId,
          category,
        },
      },
      update: { emailEnabled },
      create: {
        userId,
        category,
        emailEnabled,
      },
    });
  }

  /**
   * Changes the password and ends every existing session (all devices).
   * A fresh session is issued for the caller so the current client stays
   * signed in; access tokens issued earlier are rejected via passwordChangedAt.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt || user.disabledAt) {
      throw new UnauthorizedException('User not found.');
    }

    const isMatch = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Your current password is incorrect.',
      });
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 10);

    // One transaction under the per-user session lock: a concurrent refresh
    // either commits before (and its new token is revoked here) or runs after
    // (and finds its token revoked). The caller's fresh session is created in
    // the same transaction so it can never be revoked by this change.
    const tokens = await this.prisma.$transaction(async (tx) => {
      const locked = await this.authService.lockUser(tx, userId);
      // The current password was verified outside the lock; reject if the
      // account was blocked or the password changed concurrently.
      if (
        !locked ||
        locked.blocked ||
        locked.passwordHash !== user.passwordHash
      ) {
        return null;
      }

      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: newPasswordHash, passwordChangedAt: new Date() },
      });
      await this.authService.revokeAllForUser(userId, tx);
      return this.authService.issueSession(tx, locked.id, locked.email);
    });

    if (!tokens) {
      throw new UnauthorizedException({
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Your current password is incorrect.',
      });
    }

    return {
      message: 'Your password has been changed.',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }
}
