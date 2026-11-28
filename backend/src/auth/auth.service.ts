import {
  Injectable,
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, RefreshToken } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import {
  REFRESH_REUSE_GRACE_MS,
  REFRESH_TOKEN_TTL_MS,
  generateRefreshToken,
  hashRefreshToken,
} from './refresh-token.util';
import { ACCESS_TOKEN_TTL, ACCESS_TOKEN_TYPE } from './jwt-config';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  tokenType: typeof ACCESS_TOKEN_TYPE;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

/** User state read while holding the per-user session lock. */
export interface LockedUser {
  id: string;
  email: string;
  passwordHash: string;
  blocked: boolean;
}

type PrismaTx = Prisma.TransactionClient;

type RefreshOutcome =
  | { kind: 'rotated'; userId: string; email: string }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'rotatedRecently' }
  | { kind: 'reused'; userId: string; familyId: string };

/*
 * Session lock discipline (R-1)
 * -----------------------------
 * Every operation that creates, rotates or revokes refresh tokens of a user
 * runs in one transaction that first takes `SELECT ... FOR UPDATE` on that
 * user's row, and only then reads/writes RefreshToken rows. Under READ
 * COMMITTED this serializes refresh, logout, reuse revocation, login and
 * password change per user: a revoking statement can no longer miss a token
 * inserted by a concurrent, not-yet-committed rotation. Each operation locks
 * exactly one User row and always before any RefreshToken row, so the lock
 * order is identical everywhere and cannot deadlock.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'This email address is already in use.',
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
      message: 'User created successfully.',
      user,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Deleted/disabled accounts get the same response as wrong credentials
    // so the endpoint does not reveal account state.
    if (
      !user ||
      !(await bcrypt.compare(dto.password, user.passwordHash)) ||
      user.deletedAt ||
      user.disabledAt
    ) {
      throw this.invalidCredentials();
    }

    // The password was verified outside the lock (bcrypt is slow). Re-check
    // under the lock that it has not been changed meanwhile, otherwise a login
    // racing a password change could create a session with the old password.
    const tokens = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockUser(tx, user.id);
      if (
        !locked ||
        locked.blocked ||
        locked.passwordHash !== user.passwordHash
      ) {
        return null;
      }
      return this.issueSession(tx, locked.id, locked.email);
    });

    if (!tokens) {
      throw this.invalidCredentials();
    }

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

  /**
   * Rotates an opaque refresh token. The initial lookup only discovers which
   * user to lock; every decision is made on state re-read under the lock.
   * Errors are returned from the transaction (not thrown inside it) so that
   * revocations performed while rejecting a token are committed.
   */
  async refreshTokens(rawToken: string | undefined): Promise<IssuedTokens> {
    if (typeof rawToken !== 'string' || rawToken.length === 0) {
      throw this.invalidRefreshToken();
    }

    const tokenHash = hashRefreshToken(rawToken);

    // Preliminary, unlocked lookup: used only to find the user to lock.
    const candidate = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });

    // Unknown value: random string, legacy JWT refresh token, or an access token.
    if (!candidate) {
      throw this.invalidRefreshToken();
    }

    const nextRawToken = generateRefreshToken();

    const outcome = await this.prisma.$transaction(
      async (tx): Promise<RefreshOutcome> => {
        const user = await this.lockUser(tx, candidate.userId);
        if (!user) {
          return { kind: 'invalid' };
        }

        // Authoritative token state, read after the user lock was acquired.
        const token = await tx.refreshToken.findUnique({
          where: { tokenHash },
        });
        if (!token || token.userId !== user.id) {
          return { kind: 'invalid' };
        }

        if (user.blocked) {
          await this.revokeAllForUser(user.id, tx);
          return { kind: 'invalid' };
        }

        const now = new Date();

        if (token.revokedAt) {
          // A password change, logout or earlier rotation revoked this token.
          // Password changes revoke every token under this same lock, so a
          // token that predates one can never be observed as active here.
          const rotatedRecently =
            token.replacedByTokenId !== null &&
            now.getTime() - token.revokedAt.getTime() <= REFRESH_REUSE_GRACE_MS;
          if (rotatedRecently) {
            return { kind: 'rotatedRecently' };
          }

          await this.revokeFamily(tx, token);
          return {
            kind: 'reused',
            userId: user.id,
            familyId: token.familyId ?? token.id,
          };
        }

        if (token.expiresAt <= now) {
          return { kind: 'expired' };
        }

        // Conditional consume kept as a second line of defence.
        const consumed = await tx.refreshToken.updateMany({
          where: { id: token.id, revokedAt: null, expiresAt: { gt: now } },
          data: { revokedAt: now },
        });
        if (consumed.count !== 1) {
          return { kind: 'invalid' };
        }

        const next = await this.createRefreshToken(tx, {
          userId: user.id,
          familyId: token.familyId ?? token.id,
          rawToken: nextRawToken,
          now,
        });
        await tx.refreshToken.update({
          where: { id: token.id },
          data: { replacedByTokenId: next.id },
        });

        return { kind: 'rotated', userId: user.id, email: user.email };
      },
    );

    switch (outcome.kind) {
      case 'rotated':
        return {
          accessToken: this.signAccessToken(outcome.userId, outcome.email),
          refreshToken: nextRawToken,
        };
      case 'expired':
        throw new UnauthorizedException({
          code: 'REFRESH_TOKEN_EXPIRED',
          message: 'Your session has expired. Please sign in again.',
        });
      case 'rotatedRecently':
        // Benign race (e.g. two tabs). The winner's new session stays intact.
        throw new UnauthorizedException({
          code: 'REFRESH_TOKEN_ROTATED',
          message: 'The session was refreshed by another request.',
        });
      case 'reused':
        this.logger.warn(
          `Refresh token reuse detected; revoked session family (user=${outcome.userId}, family=${outcome.familyId}).`,
        );
        throw new UnauthorizedException({
          code: 'REFRESH_TOKEN_REUSED',
          message: 'A security issue was detected. Please sign in again.',
        });
      default:
        throw this.invalidRefreshToken();
    }
  }

  /**
   * Ends the session the refresh cookie belongs to. Without a usable cookie
   * (or with another user's cookie) every session of the user is revoked,
   * which is the safe default. Only the caller's own tokens are ever touched.
   */
  async logout(userId: string, rawToken?: string) {
    const tokenHash =
      typeof rawToken === 'string' && rawToken.length > 0
        ? hashRefreshToken(rawToken)
        : null;

    await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, userId);

      const token = tokenHash
        ? await tx.refreshToken.findUnique({ where: { tokenHash } })
        : null;

      if (token && token.userId === userId) {
        await this.revokeFamily(tx, token);
      } else {
        await this.revokeAllForUser(userId, tx);
      }
    });

    return { message: 'Logged out successfully.' };
  }

  /**
   * Mobile logout: the request carries only the refresh token (no access
   * token), so possession of a known token identifies the session. Ends that
   * token's family under the same per-user lock as every other operation.
   */
  async logoutWithRefreshToken(rawToken: string) {
    if (typeof rawToken !== 'string' || rawToken.length === 0) {
      throw this.invalidRefreshToken();
    }
    const tokenHash = hashRefreshToken(rawToken);

    // Preliminary, unlocked lookup: used only to find the user to lock.
    const candidate = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
    if (!candidate) {
      throw this.invalidRefreshToken();
    }

    const found = await this.prisma.$transaction(async (tx) => {
      await this.lockUser(tx, candidate.userId);
      const token = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!token || token.userId !== candidate.userId) {
        return false;
      }
      await this.revokeFamily(tx, token);
      return true;
    });

    if (!found) {
      throw this.invalidRefreshToken();
    }
    return { message: 'Logged out successfully.' };
  }

  /**
   * Starts a new session (token family). Must run inside a transaction that
   * already holds the user's session lock (see lockUser).
   */
  async issueSession(
    tx: PrismaTx,
    userId: string,
    email: string,
  ): Promise<IssuedTokens> {
    const rawToken = generateRefreshToken();
    await this.createRefreshToken(tx, {
      userId,
      familyId: randomUUID(),
      rawToken,
      now: new Date(),
    });

    return {
      accessToken: this.signAccessToken(userId, email),
      refreshToken: rawToken,
    };
  }

  /** Revokes every active refresh token of the user (all devices). */
  async revokeAllForUser(
    userId: string,
    client: PrismaTx | PrismaService = this.prisma,
  ) {
    await client.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Takes the per-user session lock (row lock on "User", held until the
   * transaction ends) and returns the user's current state.
   */
  async lockUser(tx: PrismaTx, userId: string): Promise<LockedUser | null> {
    const rows = await tx.$queryRaw<LockedUser[]>`
      SELECT "id", "email", "passwordHash",
             ("deletedAt" IS NOT NULL OR "disabledAt" IS NOT NULL) AS "blocked"
      FROM "User"
      WHERE "id" = ${userId}
      FOR UPDATE`;
    return rows[0] ?? null;
  }

  private signAccessToken(userId: string, email: string): string {
    const payload: AccessTokenPayload = {
      sub: userId,
      email,
      tokenType: ACCESS_TOKEN_TYPE,
    };
    return this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
  }

  private createRefreshToken(
    client: PrismaTx,
    params: { userId: string; familyId: string; rawToken: string; now: Date },
  ) {
    return client.refreshToken.create({
      data: {
        userId: params.userId,
        familyId: params.familyId,
        tokenHash: hashRefreshToken(params.rawToken),
        expiresAt: new Date(params.now.getTime() + REFRESH_TOKEN_TTL_MS),
      },
    });
  }

  /** Revokes the token family; legacy rows without a family are revoked alone. */
  private async revokeFamily(
    client: PrismaTx,
    token: Pick<RefreshToken, 'id' | 'familyId'>,
  ) {
    await client.refreshToken.updateMany({
      where: token.familyId
        ? { familyId: token.familyId, revokedAt: null }
        : { id: token.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private invalidCredentials() {
    return new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
  }

  private invalidRefreshToken() {
    return new UnauthorizedException({
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Your session has expired. Please sign in again.',
    });
  }
}
