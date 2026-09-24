import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Bu e-posta adresi zaten kullanımda.',
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        createdAt: true,
      },
    });

    return {
      message: 'Kullanıcı başarıyla oluşturuldu.',
      user,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'E-posta veya şifre hatalı.',
      });
    }

    const tokens = await this.generateTokens(user.id, user.email);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken, 
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    try {
      const secret = this.configService.get<string>('JWT_SECRET'); if (!secret) throw new Error('JWT_SECRET is missing');
      const payload = this.jwtService.verify(refreshToken, { secret });

      const storedTokens = await this.prisma.refreshToken.findMany({
        where: { userId: payload.sub, revokedAt: null },
      });

      let matchedTokenId: string | null = null;
      for (const t of storedTokens) {
        const isValid = await bcrypt.compare(refreshToken, t.tokenHash);
        if (isValid) {
          matchedTokenId = t.id;
          break;
        }
      }

      if (!matchedTokenId) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: payload.sub },
          data: { revokedAt: new Date() },
        });
        throw new UnauthorizedException({
          code: 'TOKEN_THEFT_DETECTED',
          message: 'Güvenlik ihlali tespit edildi. Lütfen tekrar giriş yapın.',
        });
      }

      await this.prisma.refreshToken.update({
        where: { id: matchedTokenId },
        data: { revokedAt: new Date() },
      });

      return this.generateTokens(payload.sub, payload.email);
    } catch (error) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.',
      });
    }
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Başarıyla çıkış yapıldı.' };
  }

  private async generateTokens(userId: string, email: string) {
    const secret = this.configService.get<string>('JWT_SECRET') || 'fallback-secret';

    const payload = { sub: userId, email };

    const accessToken = this.jwtService.sign(payload, {
      secret,
      expiresIn: '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret,
      expiresIn: '30d',
    });

    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); 

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }
}