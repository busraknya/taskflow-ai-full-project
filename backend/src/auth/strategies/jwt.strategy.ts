import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ACCESS_TOKEN_TYPE, getRequiredJwtSecret } from '../jwt-config';

interface VerifiedAccessPayload {
  sub: string;
  email: string;
  tokenType?: string;
  iat?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Throws at startup unless JWT_SECRET has at least 32 bytes.
      secretOrKey: getRequiredJwtSecret(configService),
    });
  }

  async validate(payload: VerifiedAccessPayload) {
    // Only access tokens may authenticate API requests.
    if (
      payload.tokenType !== ACCESS_TOKEN_TYPE ||
      typeof payload.sub !== 'string'
    ) {
      throw new UnauthorizedException('Invalid access token.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.deletedAt || user.disabledAt) {
      throw new UnauthorizedException('Invalid session.');
    }

    // Tokens issued before the last password change are no longer valid.
    // `iat` has second precision, so compare at second granularity.
    if (user.passwordChangedAt) {
      const changedAtSeconds = Math.floor(
        user.passwordChangedAt.getTime() / 1000,
      );
      if (typeof payload.iat !== 'number' || payload.iat < changedAtSeconds) {
        throw new UnauthorizedException('Invalid session.');
      }
    }

    return { id: user.id, email: user.email };
  }
}
