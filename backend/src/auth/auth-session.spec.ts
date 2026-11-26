/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
// supertest exposes response bodies and the HTTP server as `any`.
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { InMemoryPrisma, UserRow } from '../../test/support/in-memory-prisma';
import { InMemoryRateLimit } from '../../test/support/in-memory-rate-limit';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { RateLimitModule } from '../common/rate-limit/rate-limit.module';
import { RateLimitService } from '../common/rate-limit/rate-limit.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PrismaService } from '../prisma/prisma.service';
import { UsersModule } from '../users/users.module';
import { AuthModule } from './auth.module';
import { REFRESH_REUSE_GRACE_MS, hashRefreshToken } from './refresh-token.util';

// HS256 secrets must be at least 32 bytes (enforced at startup).
const TEST_SECRET = 'test-only-jwt-secret-at-least-32-bytes-long';
const PASSWORD = 'Password123';
const PROTECTED = '/api/v1/users/me/notification-preferences';

/**
 * HTTP-level regression tests for SEC-01 (token separation, rotation, reuse
 * detection, session lifecycle). They run the real controllers, passport
 * guard, rate-limit guard, cookie parsing and validation against in-memory
 * Prisma and rate-limit fakes.
 */
describe('Auth session security (SEC-01)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let rateLimit: InMemoryRateLimit;
  let jwt: JwtService;
  let user: UserRow;

  beforeAll(async () => {
    process.env.JWT_SECRET = TEST_SECRET;
    prisma = new InMemoryPrisma();
    rateLimit = new InMemoryRateLimit();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PrismaModule,
        RateLimitModule,
        AuthModule,
        UsersModule,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RateLimitService)
      .useValue(rateLimit)
      .compile();

    app = moduleRef.createNestApplication({ logger: false });
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
    jwt = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    prisma.users = [];
    prisma.refreshTokens = [];
    rateLimit.reset();
    user = prisma.addUser({
      email: 'alice@example.test',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
    });
  });

  // ---------- helpers ----------

  function readRefreshCookie(res: request.Response): string | undefined {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    const cookie = raw?.find((c) => c.startsWith('refreshToken='));
    if (!cookie) return undefined;
    return decodeURIComponent(
      cookie.split(';')[0].slice('refreshToken='.length),
    );
  }

  async function login(password = PASSWORD) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password });
    return {
      res,
      accessToken: res.body.accessToken as string,
      refreshToken: readRefreshCookie(res)!,
    };
  }

  function refresh(token: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', `refreshToken=${encodeURIComponent(token)}`);
  }

  function callProtected(accessToken: string) {
    return request(app.getHttpServer())
      .get(PROTECTED)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  // Mobile transport: refresh token travels in the request body.
  function mobileLogin(email = user.email, password = PASSWORD) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/mobile/login')
      .send({ email, password });
  }

  function mobileRefresh(refreshToken: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/mobile/refresh')
      .send({ refreshToken });
  }

  function mobileLogout(refreshToken: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/mobile/logout')
      .send({ refreshToken });
  }

  function rowFor(rawToken: string) {
    return prisma.refreshTokens.find(
      (t) => t.tokenHash === hashRefreshToken(rawToken),
    )!;
  }

  function changePassword(accessToken: string) {
    return request(app.getHttpServer())
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'NewPassword456' });
  }

  function logout(accessToken: string, refreshToken: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', `refreshToken=${encodeURIComponent(refreshToken)}`);
  }

  /** Starts a supertest request immediately (supertest is lazy until .then). */
  function start(req: request.Test): Promise<request.Response> {
    return req.then((res) => res);
  }

  function activeTokens() {
    return prisma.refreshTokens.filter((t) => t.revokedAt === null);
  }

  async function until(condition: () => boolean) {
    for (let i = 0; i < 10_000 && !condition(); i++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    if (!condition()) throw new Error('condition not reached');
  }

  /**
   * Deterministic barrier: the next transaction that acquires the user's
   * session lock pauses while holding it until `release()` is called.
   */
  function holdNextLock() {
    let entered!: () => void;
    let release!: () => void;
    const enteredP = new Promise<void>((r) => (entered = r));
    const gate = new Promise<void>((r) => (release = r));
    prisma.lockHook = async () => {
      prisma.lockHook = undefined;
      entered();
      await gate;
    };
    return { lockAcquired: enteredP, release };
  }

  /** Waits until `n` transactions are blocked on the user's session lock. */
  const waitForLockWaiters = (n: number) =>
    until(() => prisma.waitersFor(user.id) === n);

  // ---------- token separation ----------

  it('1. accepts a valid access token', async () => {
    const { res, accessToken } = await login();
    expect(res.status).toBe(200);
    await callProtected(accessToken).expect(200);

    const payload: Record<string, unknown> = jwt.decode(accessToken);
    expect(payload.tokenType).toBe('access');
  });

  it('stores only the SHA-256 hash of the opaque refresh token', async () => {
    const { refreshToken } = await login();

    expect(refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
    const row = rowFor(refreshToken);
    expect(row).toBeDefined();
    expect(row.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(prisma.refreshTokens)).not.toContain(refreshToken);
  });

  it('2. rejects a refresh token used as a Bearer token', async () => {
    const { refreshToken } = await login();
    await callProtected(refreshToken).expect(401);
  });

  it('rejects legacy access tokens without the tokenType claim', async () => {
    const legacy = jwt.sign({ sub: user.id, email: user.email });
    await callProtected(legacy).expect(401);
  });

  it('rejects pre-migration JWT refresh tokens on every transport', async () => {
    // Refresh tokens issued by the previous JWT-based implementation.
    const legacyRefresh = jwt.sign(
      { sub: user.id, email: user.email, tokenType: 'refresh' },
      { expiresIn: '30d' },
    );
    await callProtected(legacyRefresh).expect(401);
    await refresh(legacyRefresh).expect(401);
    await mobileRefresh(legacyRefresh).expect(401);
  });

  it('3. rejects an access token used as the refresh cookie', async () => {
    const { accessToken, refreshToken } = await login();

    const res = await refresh(accessToken).expect(401);
    expect(res.body.code).toBe('INVALID_REFRESH_TOKEN');

    // The probe must not damage the real session.
    await refresh(refreshToken).expect(200);
  });

  // ---------- rotation & reuse ----------

  it('4. rotates a valid refresh token', async () => {
    const { refreshToken } = await login();

    const res = await refresh(refreshToken).expect(200);
    const next = readRefreshCookie(res)!;

    expect(next).toBeDefined();
    expect(next).not.toBe(refreshToken);
    await callProtected(res.body.accessToken).expect(200);

    const oldRow = rowFor(refreshToken);
    const newRow = rowFor(next);
    expect(oldRow.revokedAt).not.toBeNull();
    expect(oldRow.replacedByTokenId).toBe(newRow.id);
    expect(newRow.familyId).toBe(oldRow.familyId);
    expect(newRow.revokedAt).toBeNull();
  });

  it('5. does not allow the previous refresh token to be reused', async () => {
    const { refreshToken } = await login();
    const next = readRefreshCookie(await refresh(refreshToken).expect(200))!;

    // Within the grace window: rejected, but the new session stays valid.
    const res = await refresh(refreshToken).expect(401);
    expect(res.body.code).toBe('REFRESH_TOKEN_ROTATED');
    await refresh(next).expect(200);
  });

  it('6. revokes the session family when an old token is reused', async () => {
    const victim = await login();
    const otherDevice = await login();

    const next = readRefreshCookie(
      await refresh(victim.refreshToken).expect(200),
    )!;

    // Simulate replay of the stolen token after the grace window.
    rowFor(victim.refreshToken).revokedAt = new Date(
      Date.now() - REFRESH_REUSE_GRACE_MS - 1_000,
    );

    const res = await refresh(victim.refreshToken).expect(401);
    expect(res.body.code).toBe('REFRESH_TOKEN_REUSED');

    // The whole family is revoked, including the legitimately rotated token...
    await refresh(next).expect(401);
    // ...but sessions on other devices are untouched.
    await refresh(otherDevice.refreshToken).expect(200);
  });

  it('7. lets exactly one of two concurrent refreshes succeed', async () => {
    const { refreshToken } = await login();

    const results = await Promise.all([
      refresh(refreshToken),
      refresh(refreshToken),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 401]);

    const loser = results.find((r) => r.status === 401)!;
    expect(loser.body.code).toBe('REFRESH_TOKEN_ROTATED');

    // A benign race must not revoke the winner's new session.
    const winner = results.find((r) => r.status === 200)!;
    await refresh(readRefreshCookie(winner)!).expect(200);

    const family = rowFor(refreshToken).familyId;
    const active = prisma.refreshTokens.filter(
      (t) => t.familyId === family && t.revokedAt === null,
    );
    expect(active).toHaveLength(1);
  });

  // ---------- lifecycle ----------

  it('8. rejects an expired refresh token', async () => {
    const { refreshToken } = await login();
    rowFor(refreshToken).expiresAt = new Date(Date.now() - 1_000);

    const res = await refresh(refreshToken).expect(401);
    expect(res.body.code).toBe('REFRESH_TOKEN_EXPIRED');
  });

  it('9. rejects a revoked refresh token', async () => {
    const { refreshToken } = await login();
    rowFor(refreshToken).revokedAt = new Date();

    await refresh(refreshToken).expect(401);
  });

  it('10. invalidates previous sessions after a password change', async () => {
    const deviceA = await login();
    const deviceB = await login();
    // Access token issued before the change (iat has second precision).
    const earlierAccess = jwt.sign({
      sub: user.id,
      email: user.email,
      tokenType: 'access',
      iat: Math.floor(Date.now() / 1000) - 60,
    });

    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${deviceA.accessToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'NewPassword456' })
      .expect(200);

    expect(res.body.message).toBeDefined();
    expect(res.body.refreshToken).toBeUndefined(); // never exposed in the body

    // Every pre-existing refresh token is revoked (both devices).
    await refresh(deviceA.refreshToken).expect(401);
    await refresh(deviceB.refreshToken).expect(401);
    // Access tokens issued before the change are rejected.
    await callProtected(earlierAccess).expect(401);

    // The caller continues on the fresh session.
    await callProtected(res.body.accessToken).expect(200);
    await refresh(readRefreshCookie(res)!).expect(200);

    // Old password no longer works; the new one does.
    expect((await login()).res.status).toBe(401);
    expect((await login('NewPassword456')).res.status).toBe(200);
  });

  it('11. rejects a deleted user at login, refresh and API access', async () => {
    const { accessToken, refreshToken } = await login();
    prisma.users[0].deletedAt = new Date();

    const loginRes = await login();
    expect(loginRes.res.status).toBe(401);
    expect(loginRes.res.body.code).toBe('INVALID_CREDENTIALS');
    await refresh(refreshToken).expect(401);
    await callProtected(accessToken).expect(401);
    expect(prisma.refreshTokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it('12. rejects a disabled user at login, refresh and API access', async () => {
    const { accessToken, refreshToken } = await login();
    prisma.users[0].disabledAt = new Date();

    const loginRes = await login();
    expect(loginRes.res.status).toBe(401);
    expect(loginRes.res.body.code).toBe('INVALID_CREDENTIALS');
    await refresh(refreshToken).expect(401);
    await callProtected(accessToken).expect(401);
    expect(prisma.refreshTokens.every((t) => t.revokedAt !== null)).toBe(true);
  });

  it('13. logout ends the current session only', async () => {
    const current = await login();
    const otherDevice = await login();

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .set('Cookie', `refreshToken=${encodeURIComponent(current.refreshToken)}`)
      .expect(201);

    const cleared = (res.headers['set-cookie'] as unknown as string[]).find(
      (c) => c.startsWith('refreshToken='),
    );
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);

    await refresh(current.refreshToken).expect(401);
    await refresh(otherDevice.refreshToken).expect(200);
  });

  it('logout without a refresh cookie revokes all sessions of the user', async () => {
    const first = await login();
    const second = await login();

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(201);

    await refresh(first.refreshToken).expect(401);
    await refresh(second.refreshToken).expect(401);
  });

  it('logout ignores a refresh cookie that belongs to another user', async () => {
    const mallory = prisma.addUser({
      email: 'mallory@example.test',
      passwordHash: await bcrypt.hash(PASSWORD, 4),
    });
    const alice = await login();
    const malloryLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: mallory.email, password: PASSWORD })
      .expect(200);

    // Alice logs out presenting Mallory's cookie: Mallory's session must survive.
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${alice.accessToken}`)
      .set(
        'Cookie',
        `refreshToken=${encodeURIComponent(readRefreshCookie(malloryLogin)!)}`,
      )
      .expect(201);

    await refresh(readRefreshCookie(malloryLogin)!).expect(200);
    await refresh(alice.refreshToken).expect(401);
  });

  // ---------- R-1: per-user session lock ordering ----------
  // These verify lock discipline and decision logic with deterministic
  // barriers. The fake has no MVCC snapshots, so the PostgreSQL anomaly
  // itself is exercised only by test/auth-session.e2e-spec.ts.

  describe('R-1 session lock ordering', () => {
    it('R1-1. refresh holds the lock first: password change revokes the rotated session', async () => {
      const { accessToken, refreshToken } = await login();
      const hold = holdNextLock();

      const refreshP = start(refresh(refreshToken));
      await hold.lockAcquired; // refresh is inside its transaction
      const passwordP = start(changePassword(accessToken));
      await waitForLockWaiters(1); // password change is blocked on the lock
      hold.release();

      const [refreshRes, passwordRes] = await Promise.all([
        refreshP,
        passwordP,
      ]);
      expect(refreshRes.status).toBe(200);
      expect(passwordRes.status).toBe(200);

      // The token produced by the concurrent refresh did not survive.
      const rotated = readRefreshCookie(refreshRes)!;
      expect(rowFor(rotated).revokedAt).not.toBeNull();
      await refresh(rotated).expect(401);

      // Only the session issued by the password change remains.
      const active = activeTokens();
      expect(active).toHaveLength(1);
      expect(active[0].tokenHash).toBe(
        hashRefreshToken(readRefreshCookie(passwordRes)!),
      );
    });

    it('R1-2. password change holds the lock first: the concurrent refresh fails', async () => {
      const { accessToken, refreshToken } = await login();
      const hold = holdNextLock();

      const passwordP = start(changePassword(accessToken));
      await hold.lockAcquired;
      const refreshP = start(refresh(refreshToken));
      await waitForLockWaiters(1);
      hold.release();

      const [passwordRes, refreshRes] = await Promise.all([
        passwordP,
        refreshP,
      ]);
      expect(passwordRes.status).toBe(200);
      expect(refreshRes.status).toBe(401);
      expect(readRefreshCookie(refreshRes)).toBeUndefined();

      const active = activeTokens();
      expect(active).toHaveLength(1);
      expect(active[0].tokenHash).toBe(
        hashRefreshToken(readRefreshCookie(passwordRes)!),
      );
    });

    it('R1-3. the old refresh token never yields a session after a password change', async () => {
      const { accessToken, refreshToken } = await login();
      await changePassword(accessToken).expect(200);

      await refresh(refreshToken).expect(401);
      await refresh(refreshToken).expect(401);
      expect(activeTokens()).toHaveLength(1);
    });

    it('R1-4a. refresh holds the lock, logout waits: no active session remains in the family', async () => {
      const { accessToken, refreshToken } = await login();
      const family = rowFor(refreshToken).familyId;
      const hold = holdNextLock();

      const refreshP = start(refresh(refreshToken));
      await hold.lockAcquired;
      const logoutP = start(logout(accessToken, refreshToken));
      await waitForLockWaiters(1);
      hold.release();

      const [refreshRes, logoutRes] = await Promise.all([refreshP, logoutP]);
      expect(refreshRes.status).toBe(200);
      expect(logoutRes.status).toBe(201);

      await refresh(readRefreshCookie(refreshRes)!).expect(401);
      expect(activeTokens().filter((t) => t.familyId === family)).toHaveLength(
        0,
      );
    });

    it('R1-4b. logout holds the lock, refresh waits: the refresh fails', async () => {
      const { accessToken, refreshToken } = await login();
      const family = rowFor(refreshToken).familyId;
      const hold = holdNextLock();

      const logoutP = start(logout(accessToken, refreshToken));
      await hold.lockAcquired;
      const refreshP = start(refresh(refreshToken));
      await waitForLockWaiters(1);
      hold.release();

      const [logoutRes, refreshRes] = await Promise.all([logoutP, refreshP]);
      expect(logoutRes.status).toBe(201);
      expect(refreshRes.status).toBe(401);
      expect(activeTokens().filter((t) => t.familyId === family)).toHaveLength(
        0,
      );
    });

    it('R1-5a. legitimate rotation holds the lock, reuse waits: the whole family ends revoked', async () => {
      const victim = await login();
      const family = rowFor(victim.refreshToken).familyId;
      const current = readRefreshCookie(
        await refresh(victim.refreshToken).expect(200),
      )!;
      // The stolen (rotated) token is replayed after the grace window.
      rowFor(victim.refreshToken).revokedAt = new Date(
        Date.now() - REFRESH_REUSE_GRACE_MS - 1_000,
      );
      const hold = holdNextLock();

      const legitP = start(refresh(current));
      await hold.lockAcquired;
      const reuseP = start(refresh(victim.refreshToken));
      await waitForLockWaiters(1);
      hold.release();

      const [legitRes, reuseRes] = await Promise.all([legitP, reuseP]);
      expect(legitRes.status).toBe(200);
      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.code).toBe('REFRESH_TOKEN_REUSED');

      // The token rotated by the concurrent legitimate refresh is revoked too.
      await refresh(readRefreshCookie(legitRes)!).expect(401);
      expect(activeTokens().filter((t) => t.familyId === family)).toHaveLength(
        0,
      );
    });

    it('R1-5b. reuse revocation holds the lock, rotation waits: the rotation fails', async () => {
      const victim = await login();
      const family = rowFor(victim.refreshToken).familyId;
      const current = readRefreshCookie(
        await refresh(victim.refreshToken).expect(200),
      )!;
      rowFor(victim.refreshToken).revokedAt = new Date(
        Date.now() - REFRESH_REUSE_GRACE_MS - 1_000,
      );
      const hold = holdNextLock();

      const reuseP = start(refresh(victim.refreshToken));
      await hold.lockAcquired;
      const legitP = start(refresh(current));
      await waitForLockWaiters(1);
      hold.release();

      const [reuseRes, legitRes] = await Promise.all([reuseP, legitP]);
      expect(reuseRes.body.code).toBe('REFRESH_TOKEN_REUSED');
      expect(legitRes.status).toBe(401);
      expect(activeTokens().filter((t) => t.familyId === family)).toHaveLength(
        0,
      );
    });

    it('R1-6. a login racing a password change cannot create a session with the old password', async () => {
      const { accessToken } = await login();
      const hold = holdNextLock();

      const passwordP = start(changePassword(accessToken));
      await hold.lockAcquired;
      // bcrypt check of the old password passes before the lock is reached.
      const loginP = start(
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: user.email, password: PASSWORD }),
      );
      await waitForLockWaiters(1);
      hold.release();

      const [passwordRes, loginRes] = await Promise.all([passwordP, loginP]);
      expect(passwordRes.status).toBe(200);
      expect(loginRes.status).toBe(401);
      expect(loginRes.body.code).toBe('INVALID_CREDENTIALS');
      expect(activeTokens()).toHaveLength(1);
    });

    it('R1-7. operations on different users do not block each other', async () => {
      const other = prisma.addUser({
        email: 'bob@example.test',
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      });
      const otherLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: other.email, password: PASSWORD })
        .expect(200);
      const { refreshToken } = await login();
      const hold = holdNextLock();

      const aliceP = start(refresh(refreshToken));
      await hold.lockAcquired; // Alice's lock is held...
      // ...yet Bob's refresh completes without waiting for it.
      await refresh(readRefreshCookie(otherLogin)!).expect(200);
      hold.release();
      expect((await aliceP).status).toBe(200);
    });
  });

  // ---------- mobile (request-body) transport ----------
  // Same opaque-token rotation, reuse detection and locking as the web flow;
  // only the transport differs.

  describe('Mobile body-based refresh flow', () => {
    it('M1. mobile login returns an opaque refresh token in the body and sets no cookie', async () => {
      const res = await mobileLogin().expect(200);

      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(res.body.user.email).toBe(user.email);
      expect(readRefreshCookie(res)).toBeUndefined();
      expect(rowFor(res.body.refreshToken).tokenHash).toBe(
        hashRefreshToken(res.body.refreshToken),
      );
    });

    it('M2. mobile refresh rotates the token through the request body', async () => {
      const login = await mobileLogin().expect(200);

      const res = await mobileRefresh(login.body.refreshToken).expect(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(res.body.refreshToken).not.toBe(login.body.refreshToken);
      expect(readRefreshCookie(res)).toBeUndefined();
      await callProtected(res.body.accessToken).expect(200);

      const oldRow = rowFor(login.body.refreshToken);
      expect(oldRow.revokedAt).not.toBeNull();
      expect(rowFor(res.body.refreshToken).familyId).toBe(oldRow.familyId);
    });

    it('M3. reuse of a rotated mobile token revokes its family only', async () => {
      const phone = await mobileLogin().expect(200);
      const browser = await login();
      const next = (await mobileRefresh(phone.body.refreshToken).expect(200))
        .body.refreshToken as string;
      rowFor(phone.body.refreshToken).revokedAt = new Date(
        Date.now() - REFRESH_REUSE_GRACE_MS - 1_000,
      );

      const res = await mobileRefresh(phone.body.refreshToken).expect(401);
      expect(res.body.code).toBe('REFRESH_TOKEN_REUSED');
      await mobileRefresh(next).expect(401);
      // The independent web session survives.
      await refresh(browser.refreshToken).expect(200);
    });

    it('M4. concurrent mobile refreshes produce exactly one winner', async () => {
      const login = await mobileLogin().expect(200);
      const results = await Promise.all([
        start(mobileRefresh(login.body.refreshToken)),
        start(mobileRefresh(login.body.refreshToken)),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
      const winner = results.find((r) => r.status === 200)!;
      await mobileRefresh(winner.body.refreshToken).expect(200);
    });

    it('M5. mobile logout ends only that session', async () => {
      const phone = await mobileLogin().expect(200);
      const browser = await login();

      const res = await mobileLogout(phone.body.refreshToken).expect(200);
      expect(res.body.message).toBeDefined();

      await mobileRefresh(phone.body.refreshToken).expect(401);
      await refresh(browser.refreshToken).expect(200);
    });

    it('M6. mobile endpoints reject unknown tokens, access tokens and empty bodies', async () => {
      const phone = await mobileLogin().expect(200);

      await mobileLogout('not-a-real-token').expect(401);
      await mobileRefresh(phone.body.accessToken).expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/mobile/refresh')
        .send({})
        .expect(400);
      // Rejected probes do not damage the real session.
      await mobileRefresh(phone.body.refreshToken).expect(200);
    });

    it('M7. mobile refresh racing a password change cannot survive it', async () => {
      const phone = await mobileLogin().expect(200);
      const hold = holdNextLock();

      const refreshP = start(mobileRefresh(phone.body.refreshToken));
      await hold.lockAcquired;
      const passwordP = start(changePassword(phone.body.accessToken));
      await waitForLockWaiters(1);
      hold.release();

      const [refreshRes, passwordRes] = await Promise.all([
        refreshP,
        passwordP,
      ]);
      expect(refreshRes.status).toBe(200);
      expect(passwordRes.status).toBe(200);
      await mobileRefresh(refreshRes.body.refreshToken).expect(401);
      expect(activeTokens()).toHaveLength(1);
    });

    it('web refresh never exposes the refresh token in the response body', async () => {
      const { res, refreshToken } = await login();
      expect(res.body.refreshToken).toBeUndefined();

      const refreshed = await refresh(refreshToken).expect(200);
      expect(refreshed.body.refreshToken).toBeUndefined();
      expect(Object.keys(refreshed.body)).toEqual(['accessToken']);
    });

    it('treats a non-string (JSON) refresh cookie as missing', async () => {
      // cookie-parser turns `j:`-prefixed values into objects.
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', `refreshToken=${encodeURIComponent('j:{"a":1}')}`)
        .expect(401);
      expect(res.body.code).toBe('NO_REFRESH_TOKEN');
    });
  });

  // ---------- rate limiting (remote AuthRateLimitGuard) ----------

  describe('Authentication rate limiting', () => {
    it('RL1. login is limited to 10 attempts per window and returns Retry-After', async () => {
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
    });

    it('RL2. web and mobile refresh are limited to 30 requests per window', async () => {
      for (let i = 0; i < 30; i++) {
        await refresh('junk').expect(401);
      }
      await refresh('junk').expect(429);

      for (let i = 0; i < 30; i++) {
        await mobileRefresh('junk').expect(401);
      }
      await mobileRefresh('junk').expect(429);
    });

    it('RL3. mobile login, mobile logout and register are rate limited', async () => {
      const limited = async (send: () => request.Test) => {
        let last = 0;
        for (let i = 0; i < 11; i++) last = (await send()).status;
        return last;
      };
      expect(
        await limited(() => mobileLogin(user.email, 'wrong-password1')),
      ).toBe(429);
      expect(await limited(() => mobileLogout('junk'))).toBe(429);
      expect(
        await limited(() =>
          request(app.getHttpServer())
            .post('/api/v1/auth/register')
            .send({ email: 'x@example.test' }),
        ),
      ).toBe(429);
    });
  });

  // ---------- cross-user session isolation ----------

  describe('Cross-user session isolation', () => {
    async function loginAs(email: string) {
      prisma.addUser({ email, passwordHash: await bcrypt.hash(PASSWORD, 4) });
      return (await mobileLogin(email).expect(200)).body as {
        accessToken: string;
        refreshToken: string;
      };
    }

    it('X1. one user logging out or reusing a token never affects another user', async () => {
      const alice = await mobileLogin().expect(200);
      const bob = await loginAs('bob@example.test');

      // Bob's reuse detection revokes only Bob's family.
      await mobileRefresh(bob.refreshToken).expect(200);
      const bobRow = prisma.refreshTokens.find(
        (t) => t.tokenHash === hashRefreshToken(bob.refreshToken),
      )!;
      bobRow.revokedAt = new Date(Date.now() - REFRESH_REUSE_GRACE_MS - 1_000);
      await mobileRefresh(bob.refreshToken).expect(401);

      // Bob logs out everything he has.
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(201);

      await mobileRefresh(alice.body.refreshToken).expect(200);
      expect(activeTokens().every((t) => t.userId === user.id)).toBe(true);
    });

    it("X2. a password change revokes only the changing user's sessions", async () => {
      const alice = await mobileLogin().expect(200);
      const bob = await loginAs('bob@example.test');

      await changePassword(alice.body.accessToken).expect(200);

      await mobileRefresh(bob.refreshToken).expect(200);
      await mobileRefresh(alice.body.refreshToken).expect(401);
    });
  });
});
