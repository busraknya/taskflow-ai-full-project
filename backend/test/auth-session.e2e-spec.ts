/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { Pool, PoolClient } from 'pg';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { hashRefreshToken } from '../src/auth/refresh-token.util';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RateLimitModule } from '../src/common/rate-limit/rate-limit.module';
import { applySecurityHeaders } from '../src/common/security/security-headers';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersModule } from '../src/users/users.module';

/**
 * SEC-01 / R-1 against a real PostgreSQL database (row locks, READ COMMITTED)
 * and the real Redis-backed auth rate limiter.
 * Requires DATABASE_URL pointing at a migrated, disposable test database,
 * REDIS_HOST/REDIS_PORT of a disposable Redis, and JWT_SECRET (>= 32 bytes).
 * Only users created by this suite (and their cascading refresh tokens) and
 * `rate-limit:*` keys are touched and removed.
 *
 *   DATABASE_URL=... npx prisma migrate deploy --config prisma.config.ts
 *   DATABASE_URL=... REDIS_HOST=... REDIS_PORT=... JWT_SECRET=... \
 *     npm run test:e2e -- auth-session
 *
 * R-1 ordering tests use a deterministic barrier: a separate connection holds
 * `SELECT ... FOR UPDATE` on the user's row, each application request is
 * started only after the previous one is observed waiting for that lock in
 * pg_stat_activity, and then the barrier is released. PostgreSQL grants the
 * row lock to waiters in arrival order, so the operations run in that order.
 */
const describeWithDb =
  process.env.DATABASE_URL && process.env.JWT_SECRET && process.env.REDIS_HOST
    ? describe
    : describe.skip;

const PASSWORD = 'Password123';
const NEW_PASSWORD = 'NewPassword456';

describeWithDb('Auth session security against PostgreSQL (SEC-01, R-1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let barrierPool: Pool;
  let redis: Redis;
  const runId = randomUUID();
  let userSeq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        RateLimitModule,
        AuthModule,
        UsersModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication({ logger: false });
    applySecurityHeaders(app);
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = moduleRef.get(PrismaService);
    barrierPool = new Pool({ connectionString: process.env.DATABASE_URL });
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD || undefined,
    });
  });

  // Every request comes from 127.0.0.1, so reset the auth rate-limit
  // counters between tests (the limiter itself stays real).
  beforeEach(async () => {
    const keys = await redis.keys('rate-limit:*');
    if (keys.length > 0) await redis.del(...keys);
  });

  afterAll(async () => {
    // RefreshToken rows cascade with the user.
    await prisma?.user.deleteMany({
      where: { email: { startsWith: `sec01-${runId}-` } },
    });
    await barrierPool?.end();
    await redis?.quit();
    await app?.close();
  });

  // ---------- helpers ----------

  async function createUser() {
    return prisma.user.create({
      data: {
        email: `sec01-${runId}-${++userSeq}@example.test`,
        fullName: 'SEC-01 E2E',
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      },
    });
  }

  function readRefreshCookie(res: request.Response): string | undefined {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = raw?.find((c) => c.startsWith('refreshToken='));
    if (!cookie) return undefined;
    return decodeURIComponent(
      cookie.split(';')[0].slice('refreshToken='.length),
    );
  }

  function loginRequest(email: string, password = PASSWORD) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
  }

  async function login(email: string) {
    const res = await loginRequest(email).expect(200);
    return {
      accessToken: res.body.accessToken as string,
      refreshToken: readRefreshCookie(res)!,
    };
  }

  const refresh = (token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${encodeURIComponent(token)}`);

  const callProtected = (token: string) =>
    request(app.getHttpServer())
      .get('/api/v1/users/me/notification-preferences')
      .set('Authorization', `Bearer ${token}`);

  const changePassword = (accessToken: string) =>
    request(app.getHttpServer())
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

  const logout = (accessToken: string, refreshToken: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', `refreshToken=${encodeURIComponent(refreshToken)}`);

  /** supertest is lazy; this sends the request immediately. */
  const start = (req: request.Test): Promise<request.Response> =>
    req.then((res) => res);

  const tokenRow = (raw: string) =>
    prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(raw) },
    });

  const activeTokens = (userId: string) =>
    prisma.refreshToken.findMany({ where: { userId, revokedAt: null } });

  /** Holds the user's session lock from an independent connection. */
  async function holdUserLock(userId: string) {
    const client: PoolClient = await barrierPool.connect();
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM "User" WHERE "id" = $1 FOR UPDATE', [
      userId,
    ]);
    return {
      async release() {
        await client.query('COMMIT');
        client.release();
      },
    };
  }

  /**
   * Resolves once `n` backends of this (disposable, suite-exclusive) database
   * are blocked waiting for a lock. Polls a condition; no fixed sleeps.
   */
  async function waitForLockWaiters(n: number) {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const { rows } = await barrierPool.query<{ waiting: string }>(
        `SELECT count(*) AS waiting
           FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND pid <> pg_backend_pid()`,
      );
      if (Number(rows[0].waiting) >= n) return;
      if (Date.now() > deadline) {
        throw new Error(`expected ${n} lock waiters, saw ${rows[0].waiting}`);
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  // ---------- baseline SEC-01 behaviour ----------

  it('separates access and refresh tokens', async () => {
    const user = await createUser();
    const { accessToken, refreshToken } = await login(user.email);
    await callProtected(accessToken).expect(200);
    await callProtected(refreshToken).expect(401);
    await refresh(accessToken).expect(401);
    expect(await tokenRow(refreshToken)).not.toBeNull();
  });

  it('normal refresh rotation keeps working', async () => {
    const user = await createUser();
    const { refreshToken } = await login(user.email);
    const res = await refresh(refreshToken).expect(200);
    const next = readRefreshCookie(res)!;

    expect((await tokenRow(refreshToken))!.revokedAt).not.toBeNull();
    expect((await tokenRow(next))!.revokedAt).toBeNull();
    await callProtected(res.body.accessToken).expect(200);
  });

  it('allows exactly one of many concurrent refreshes', async () => {
    const user = await createUser();
    const { refreshToken } = await login(user.email);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => start(refresh(refreshToken))),
    );
    const ok = results.filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    expect(results.filter((r) => r.status === 401)).toHaveLength(4);

    // The winner's session survives the benign race.
    await refresh(readRefreshCookie(ok[0])!).expect(200);
    expect(await activeTokens(user.id)).toHaveLength(1);
  });

  it('revokes the family on reuse after the grace window', async () => {
    const user = await createUser();
    const { refreshToken } = await login(user.email);
    const next = readRefreshCookie(await refresh(refreshToken).expect(200))!;

    await prisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(refreshToken) },
      data: { revokedAt: new Date(Date.now() - 120_000) },
    });

    const res = await refresh(refreshToken).expect(401);
    expect(res.body.code).toBe('REFRESH_TOKEN_REUSED');
    await refresh(next).expect(401);
  });

  // ---------- R-1 ordering ----------

  it('R1-1. refresh first, password change second: the rotated session is revoked', async () => {
    const user = await createUser();
    const { accessToken, refreshToken } = await login(user.email);
    const barrier = await holdUserLock(user.id);

    const refreshP = start(refresh(refreshToken));
    await waitForLockWaiters(1);
    const passwordP = start(changePassword(accessToken));
    await waitForLockWaiters(2);
    await barrier.release();

    const [refreshRes, passwordRes] = await Promise.all([refreshP, passwordP]);
    expect(refreshRes.status).toBe(200);
    expect(passwordRes.status).toBe(200);

    const rotated = readRefreshCookie(refreshRes)!;
    expect((await tokenRow(rotated))!.revokedAt).not.toBeNull();
    await refresh(rotated).expect(401);

    const active = await activeTokens(user.id);
    expect(active).toHaveLength(1);
    expect(active[0].tokenHash).toBe(
      hashRefreshToken(readRefreshCookie(passwordRes)!),
    );
  });

  it('R1-2. password change first, refresh second: the refresh fails', async () => {
    const user = await createUser();
    const { accessToken, refreshToken } = await login(user.email);
    const barrier = await holdUserLock(user.id);

    const passwordP = start(changePassword(accessToken));
    await waitForLockWaiters(1);
    const refreshP = start(refresh(refreshToken));
    await waitForLockWaiters(2);
    await barrier.release();

    const [passwordRes, refreshRes] = await Promise.all([passwordP, refreshP]);
    expect(passwordRes.status).toBe(200);
    expect(refreshRes.status).toBe(401);
    expect(readRefreshCookie(refreshRes)).toBeUndefined();

    const active = await activeTokens(user.id);
    expect(active).toHaveLength(1);
    expect(active[0].tokenHash).toBe(
      hashRefreshToken(readRefreshCookie(passwordRes)!),
    );
  });

  it('R1-3. the old refresh token never yields a session after a password change', async () => {
    const user = await createUser();
    const { accessToken, refreshToken } = await login(user.email);
    await changePassword(accessToken).expect(200);

    await refresh(refreshToken).expect(401);
    expect(await activeTokens(user.id)).toHaveLength(1);
  });

  it('R1-4. refresh racing logout leaves no active session in the family', async () => {
    const user = await createUser();
    const { accessToken, refreshToken } = await login(user.email);
    const familyId = (await tokenRow(refreshToken))!.familyId;
    const barrier = await holdUserLock(user.id);

    const refreshP = start(refresh(refreshToken));
    await waitForLockWaiters(1);
    const logoutP = start(logout(accessToken, refreshToken));
    await waitForLockWaiters(2);
    await barrier.release();

    const [refreshRes, logoutRes] = await Promise.all([refreshP, logoutP]);
    expect(refreshRes.status).toBe(200);
    expect(logoutRes.status).toBe(201);

    await refresh(readRefreshCookie(refreshRes)!).expect(401);
    expect(
      await prisma.refreshToken.count({ where: { familyId, revokedAt: null } }),
    ).toBe(0);
  });

  it('R1-5. rotation racing reuse revocation leaves no active session in the family', async () => {
    const user = await createUser();
    const { refreshToken: stolen } = await login(user.email);
    const familyId = (await tokenRow(stolen))!.familyId;
    const current = readRefreshCookie(await refresh(stolen).expect(200))!;
    await prisma.refreshToken.update({
      where: { tokenHash: hashRefreshToken(stolen) },
      data: { revokedAt: new Date(Date.now() - 120_000) },
    });
    const barrier = await holdUserLock(user.id);

    const legitP = start(refresh(current));
    await waitForLockWaiters(1);
    const reuseP = start(refresh(stolen));
    await waitForLockWaiters(2);
    await barrier.release();

    const [legitRes, reuseRes] = await Promise.all([legitP, reuseP]);
    expect(legitRes.status).toBe(200);
    expect(reuseRes.body.code).toBe('REFRESH_TOKEN_REUSED');

    await refresh(readRefreshCookie(legitRes)!).expect(401);
    expect(
      await prisma.refreshToken.count({ where: { familyId, revokedAt: null } }),
    ).toBe(0);
  });

  it('R1-6. a login racing a password change cannot use the old password', async () => {
    const user = await createUser();
    const { accessToken } = await login(user.email);
    const barrier = await holdUserLock(user.id);

    const passwordP = start(changePassword(accessToken));
    await waitForLockWaiters(1);
    const loginP = start(loginRequest(user.email));
    await waitForLockWaiters(2);
    await barrier.release();

    const [passwordRes, loginRes] = await Promise.all([passwordP, loginP]);
    expect(passwordRes.status).toBe(200);
    expect(loginRes.status).toBe(401);
    expect(await activeTokens(user.id)).toHaveLength(1);
  });

  // ---------- mobile (request-body) transport ----------

  const mobileLogin = (email: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/mobile/login')
      .send({ email, password: PASSWORD });

  const mobileRefresh = (refreshToken: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/mobile/refresh')
      .send({ refreshToken });

  const mobileLogout = (refreshToken: string) =>
    request(app.getHttpServer())
      .post('/api/v1/auth/mobile/logout')
      .send({ refreshToken });

  it('mobile body flow: opaque token rotation, reuse detection and logout', async () => {
    const user = await createUser();
    const phone = (await mobileLogin(user.email).expect(200)).body as {
      accessToken: string;
      refreshToken: string;
    };
    expect(phone.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await tokenRow(phone.refreshToken)).not.toBeNull();

    const rotated = await mobileRefresh(phone.refreshToken).expect(200);
    const next = rotated.body.refreshToken as string;
    expect(next).not.toBe(phone.refreshToken);
    await callProtected(rotated.body.accessToken).expect(200);

    // Within the grace window: rejected without revoking the new session.
    await mobileRefresh(phone.refreshToken).expect(401);
    const current = readRefreshCookie(
      await refresh(
        (await mobileRefresh(next).expect(200)).body.refreshToken,
      ).expect(200),
    )!; // tokens are transport-agnostic

    await mobileLogout(current).expect(200);
    await mobileRefresh(current).expect(401);
    expect(await activeTokens(user.id)).toHaveLength(0);
  });

  it('mobile refresh racing a password change cannot survive it (real row locks)', async () => {
    const user = await createUser();
    const phone = (await mobileLogin(user.email).expect(200)).body as {
      accessToken: string;
      refreshToken: string;
    };
    const barrier = await holdUserLock(user.id);

    const refreshP = start(mobileRefresh(phone.refreshToken));
    await waitForLockWaiters(1);
    const passwordP = start(changePassword(phone.accessToken));
    await waitForLockWaiters(2);
    await barrier.release();

    const [refreshRes, passwordRes] = await Promise.all([refreshP, passwordP]);
    expect(refreshRes.status).toBe(200);
    expect(passwordRes.status).toBe(200);
    await mobileRefresh(refreshRes.body.refreshToken).expect(401);
    expect(await activeTokens(user.id)).toHaveLength(1);
  });

  it('auth endpoints are rate limited through Redis', async () => {
    const user = await createUser();
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: user.email, password: 'wrong-password1' })
        .expect(401);
    }
    const blocked = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(await redis.keys('rate-limit:auth:*')).not.toHaveLength(0);
  });

  // ---------- SEC-02 ----------

  it('API responses carry the Helmet security headers', async () => {
    const res = await request(app.getHttpServer()).get(
      '/api/v1/users/me/notification-preferences',
    );
    expect(res.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('a spoofed X-Forwarded-For header does not bypass the IP limit', async () => {
    const user = await createUser();
    for (let i = 0; i < 10; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Forwarded-For', `198.51.100.${i}`)
        .send({ email: user.email, password: 'wrong-password1' })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '198.51.100.250')
      .send({ email: user.email, password: PASSWORD })
      .expect(429);
  });

  it('password changes are limited per user through Redis', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const aliceSession = await login(alice.email);
    const bobSession = await login(bob.email);
    const wrongChange = (token: string) =>
      request(app.getHttpServer())
        .patch('/api/v1/users/me/password')
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword: 'WrongPassword9', newPassword: NEW_PASSWORD });

    for (let i = 0; i < 5; i++) {
      await wrongChange(aliceSession.accessToken).expect(401);
    }
    const blocked = await wrongChange(aliceSession.accessToken).expect(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(
      await redis.keys(`rate-limit:user:${alice.id}:password-change`),
    ).toHaveLength(1);

    // Bob's quota is untouched, and Alice's other requests still work.
    await wrongChange(bobSession.accessToken).expect(401);
    await callProtected(aliceSession.accessToken).expect(200);
  });
});
