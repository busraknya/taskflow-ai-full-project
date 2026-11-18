import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

interface TokenPayload {
  sub: string;
  email: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  private getJwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('FATAL: JWT_SECRET is missing in environment variables!');
    }
    return secret;
  }

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
    let payload: TokenPayload;
    try {
      payload = this.jwtService.verify<TokenPayload>(refreshToken, {
        secret: this.getJwtSecret(),
      });
    } catch {
      throw this.invalidRefreshToken();
    }

    const storedTokens = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub },
    });

    let matchedToken: (typeof storedTokens)[number] | null = null;
    for (const storedToken of storedTokens) {
      if (await bcrypt.compare(refreshToken, storedToken.tokenHash)) {
        matchedToken = storedToken;
        break;
      }
    }

    if (!matchedToken || matchedToken.expiresAt <= new Date()) {
      throw this.invalidRefreshToken();
    }

    if (matchedToken.revokedAt) {
      // A previously rotated token is being reused. Revoke the remaining
      // sessions for this user, but do not treat a concurrent CAS loser as reuse.
      await this.prisma.refreshToken.updateMany({
        where: { userId: payload.sub, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException({
        code: 'TOKEN_REUSE_DETECTED',
        message: 'Bu oturum anahtarı daha önce kullanılmış. Lütfen tekrar giriş yapın.',
      });
    }

    const nextTokens = await this.createTokenPair(payload.sub, payload.email);

    return this.prisma.$transaction(async (tx) => {
      const rotation = await tx.refreshToken.updateMany({
        where: {
          id: matchedToken.id,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });

      if (rotation.count !== 1) {
        throw new UnauthorizedException({
          code: 'REFRESH_TOKEN_ALREADY_USED',
          message: 'Oturum anahtarı artık geçerli değil. Lütfen tekrar giriş yapın.',
        });
      }

      await tx.refreshToken.create({
        data: {
          userId: payload.sub,
          tokenHash: nextTokens.tokenHash,
          expiresAt: nextTokens.expiresAt,
        },
      });

      return {
        accessToken: nextTokens.accessToken,
        refreshToken: nextTokens.refreshToken,
      };
    });
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Başarıyla çıkış yapıldı.' };
  }

  private invalidRefreshToken() {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Oturum süresi doldu. Lütfen tekrar giriş yapın.',
    });
  }

  private async createTokenPair(userId: string, email: string): Promise<TokenPair> {
    const secret = this.getJwtSecret();
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

    return { accessToken, refreshToken, tokenHash, expiresAt };
  }

  private async generateTokens(userId: string, email: string) {
    const tokenPair = await this.createTokenPair(userId, email);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: tokenPair.tokenHash,
        expiresAt: tokenPair.expiresAt,
      },
    });

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    };
  }
}
