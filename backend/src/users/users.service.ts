import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

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
}
