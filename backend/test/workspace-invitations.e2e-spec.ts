/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MembershipStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * SEC-05: workspace invitation lifecycle against real PostgreSQL and Redis
 * (full AppModule). Requires a migrated, disposable database (DATABASE_URL),
 * a disposable Redis (REDIS_HOST/REDIS_PORT) and JWT_SECRET (>= 32 bytes).
 * Only users/workspaces created by this suite and `rate-limit:auth:*` keys
 * are touched. Point SMTP_HOST at an unused port so queued emails fail fast.
 */
const describeWithInfra =
  process.env.DATABASE_URL && process.env.JWT_SECRET && process.env.REDIS_HOST
    ? describe
    : describe.skip;

const PASSWORD = 'Password123';

type MemberRow = {
  status: string;
  user: { email: string; fullName: string | null; avatarUrl: string | null };
};

describeWithInfra('Workspace invitations against PostgreSQL (SEC-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const runId = randomUUID().slice(0, 8);
  let seq = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
    // Listen once so supertest reuses one server instead of opening and
    // closing an ephemeral listener per request (avoids sporadic
    // "socket hang up" under parallel requests with keep-alive agents).
    await app.listen(0, '127.0.0.1');
    prisma = moduleRef.get(PrismaService);
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD || undefined,
    });
  });

  beforeEach(async () => {
    // All requests come from 127.0.0.1; keep the real limiter, reset counters.
    const keys = await redis.keys('rate-limit:auth:*');
    if (keys.length > 0) await redis.del(...keys);
  });

  afterAll(async () => {
    const prefix = `sec05-${runId}-`;
    await prisma?.workspace.deleteMany({
      where: { slug: { startsWith: prefix } },
    });
    await prisma?.user.deleteMany({
      where: { email: { startsWith: prefix } },
    });
    await redis?.quit();
    await app?.close();
  });

  // ---------- helpers ----------

  const http = () => request(app.getHttpServer());

  async function newUser(label: string) {
    const email = `sec05-${runId}-${label}-${++seq}@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: `Name ${label}`,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      },
    });
    const login = await http()
      .post('/api/v1/auth/mobile/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { ...user, token: login.body.accessToken as string };
  }

  async function newWorkspace(owner: { token: string }) {
    const res = await http()
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Team', slug: `sec05-${runId}-ws-${++seq}` })
      .expect(201);
    return res.body.id as string;
  }

  const invite = (
    actor: { token: string },
    workspaceId: string,
    email: string,
    role = 'MEMBER',
  ) =>
    http()
      .post(`/api/v1/workspaces/${workspaceId}/members/invite`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ email, role });

  const accept = (actor: { token: string }, workspaceId: string) =>
    http()
      .post(`/api/v1/workspaces/${workspaceId}/members/accept`)
      .set('Authorization', `Bearer ${actor.token}`);

  const membership = (workspaceId: string, userId: string) =>
    prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });

  const start = (req: request.Test): Promise<request.Response> =>
    req.then((res) => res);

  // ---------- tests ----------

  it('pending invitees have no access until they accept; the profile stays hidden', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);

    const res = await invite(owner, ws, bob.email).expect(201);
    expect(Object.keys(res.body).sort()).toEqual(
      ['email', 'invitationExpiresAt', 'message', 'role'].sort(),
    );
    expect(JSON.stringify(res.body)).not.toContain(bob.fullName);
    expect(JSON.stringify(res.body)).not.toContain(bob.id);

    // Not a member yet.
    await http()
      .get(`/api/v1/workspaces/${ws}/projects`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(404);

    const members = await http()
      .get(`/api/v1/workspaces/${ws}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const pending = (members.body as MemberRow[]).find(
      (m) => m.user.email === bob.email,
    );
    expect(pending).toBeDefined();
    expect(pending!.status).toBe('PENDING');
    expect(pending!.user.fullName).toBeNull();
    expect(pending!.user.avatarUrl).toBeNull();

    const inbox = await http()
      .get('/api/v1/workspaces/invitations')
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    expect(
      (inbox.body as Array<{ workspaceId: string }>).map((i) => i.workspaceId),
    ).toContain(ws);

    await accept(bob, ws).expect(201);
    await http()
      .get(`/api/v1/workspaces/${ws}/projects`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    const after = await http()
      .get(`/api/v1/workspaces/${ws}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      (after.body as MemberRow[]).find((m) => m.user.email === bob.email)!.user
        .fullName,
    ).toBe(bob.fullName);
  });

  it('an invitation is single-use', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    await invite(owner, ws, bob.email).expect(201);

    await accept(bob, ws).expect(201);
    await accept(bob, ws).expect(404);
    expect((await membership(ws, bob.id))!.status).toBe(
      MembershipStatus.ACTIVE,
    );
  });

  it('concurrent accepts have exactly one winner and create one membership', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    await invite(owner, ws, bob.email).expect(201);

    const results = await Promise.all(
      Array.from({ length: 6 }, () => start(accept(bob, ws))),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 404)).toHaveLength(5);
    expect(
      await prisma.workspaceMembership.count({
        where: { workspaceId: ws, userId: bob.id },
      }),
    ).toBe(1);
  });

  it('expired invitations are rejected and can be re-issued', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    await invite(owner, ws, bob.email).expect(201);
    await prisma.workspaceMembership.update({
      where: { workspaceId_userId: { workspaceId: ws, userId: bob.id } },
      data: { invitationExpiresAt: new Date(Date.now() - 1_000) },
    });

    await accept(bob, ws).expect(403);
    expect((await membership(ws, bob.id))!.status).toBe(
      MembershipStatus.EXPIRED,
    );

    await invite(owner, ws, bob.email).expect(201);
    expect((await membership(ws, bob.id))!.status).toBe(
      MembershipStatus.PENDING,
    );
    await accept(bob, ws).expect(201);
  });

  it('revoked invitations cannot be accepted', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    await invite(owner, ws, bob.email).expect(201);
    const pending = await membership(ws, bob.id);

    await http()
      .delete(`/api/v1/workspaces/${ws}/members/${pending!.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    await accept(bob, ws).expect(404);
    expect(await membership(ws, bob.id)).toBeNull();
  });

  it('an invitation is bound to its recipient', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const carol = await newUser('carol');
    const ws = await newWorkspace(owner);
    await invite(owner, ws, bob.email).expect(201);

    await accept(carol, ws).expect(404);
    await http()
      .delete(`/api/v1/workspaces/${ws}/members/invitation`)
      .set('Authorization', `Bearer ${carol.token}`)
      .expect(404);
    expect(await membership(ws, carol.id)).toBeNull();
    expect((await membership(ws, bob.id))!.status).toBe(
      MembershipStatus.PENDING,
    );
  });

  it('unregistered addresses get the same response and create nothing', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);

    const unknown = await invite(
      owner,
      ws,
      `sec05-${runId}-nobody@example.test`,
    ).expect(201);
    const known = await invite(owner, ws, bob.email).expect(201);

    expect(Object.keys(unknown.body).sort()).toEqual(
      Object.keys(known.body).sort(),
    );
    expect(unknown.body.message).toBe(known.body.message);
    expect(
      await prisma.workspaceMembership.count({ where: { workspaceId: ws } }),
    ).toBe(2); // owner + bob only
  });

  it('concurrent invitations for the same user yield one invitation and no 500', async () => {
    const owner = await newUser('owner');
    const dave = await newUser('dave');
    const ws = await newWorkspace(owner);

    const results = await Promise.all(
      Array.from({ length: 5 }, () => start(invite(owner, ws, dave.email))),
    );
    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(4);
    for (const r of results.filter((x) => x.status === 409)) {
      expect(JSON.stringify(r.body)).not.toMatch(/Unique constraint|Prisma/i);
    }
    expect(
      await prisma.workspaceMembership.count({
        where: { workspaceId: ws, userId: dave.id },
      }),
    ).toBe(1);
  });

  it('an active member is never turned back into an invitation', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    await invite(owner, ws, bob.email).expect(201);
    await accept(bob, ws).expect(201);

    await invite(owner, ws, bob.email, 'VIEWER').expect(409);
    const row = await membership(ws, bob.id);
    expect(row!.status).toBe(MembershipStatus.ACTIVE);
    expect(row!.role).toBe('MEMBER');
  });

  it('invitations to a deleted workspace cannot be accepted or listed', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    await invite(owner, ws, bob.email).expect(201);
    await prisma.workspace.update({
      where: { id: ws },
      data: { deletedAt: new Date() },
    });

    await accept(bob, ws).expect(404);
    const inbox = await http()
      .get('/api/v1/workspaces/invitations')
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(200);
    expect(
      (inbox.body as Array<{ workspaceId: string }>).map((i) => i.workspaceId),
    ).not.toContain(ws);
    expect((await membership(ws, bob.id))!.status).toBe(
      MembershipStatus.PENDING,
    );
  });
});
