import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new Error(
        'FATAL: JWT_SECRET must contain at least 32 bytes of high-entropy secret material.',
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; email: string; tokenType?: string }) {
    if (payload.tokenType !== 'access') {
      throw new UnauthorizedException('Geçersiz erişim anahtarı.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Oturum geçersiz.');
    }

    return { id: user.id, email: user.email };
  }
}