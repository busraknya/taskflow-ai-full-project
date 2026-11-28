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
 * SEC-05: email invitation lifecycle against real PostgreSQL and Redis
 * (full AppModule). Requires a migrated, disposable database (DATABASE_URL),
 * a disposable Redis (REDIS_HOST/REDIS_PORT) and JWT_SECRET (>= 32 bytes).
 * Only users/workspaces created by this suite and `rate-limit:*` keys
 * are touched. Point SMTP_HOST at an unused port so queued emails fail fast.
 */
const describeWithInfra =
  process.env.DATABASE_URL && process.env.JWT_SECRET && process.env.REDIS_HOST
    ? describe
    : describe.skip;

const PASSWORD = 'Password123';

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
    const keys = await redis.keys('rate-limit:*');
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

  /** The single-use token from the link returned to the inviter. */
  const tokenOf = (res: request.Response) =>
    String(res.body.acceptUrl).split('#')[1];

  const accept = (actor: { token: string }, token: string) =>
    http()
      .post('/api/v1/invitations/accept')
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ token });

  const preview = (token: string) =>
    http().post('/api/v1/invitations/preview').send({ token });

  const membership = (workspaceId: string, userId: string) =>
    prisma.workspaceMembership.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });

  const canReadProjects = (actor: { token: string }, workspaceId: string) =>
    http()
      .get(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${actor.token}`);

  // ---------- tests ----------

  it('invites an address without an account; the person registers and joins with the link', async () => {
    const owner = await newUser('owner');
    const ws = await newWorkspace(owner);
    const email = `sec05-${runId}-newcomer-${++seq}@example.test`;

    const res = await invite(owner, ws, email, 'VIEWER').expect(201);
    expect(res.body).toMatchObject({
      email,
      role: 'VIEWER',
      emailDelivery: 'disabled',
    });
    const token = tokenOf(res);
    expect(token.length).toBeGreaterThanOrEqual(43);
    // Only the hash is stored.
    const stored = await prisma.workspaceInvitation.findFirst({
      where: { workspaceId: ws, email },
    });
    expect(stored!.tokenHash).not.toContain(token);

    const shown = await preview(token).expect(200);
    expect(shown.body).toMatchObject({
      status: 'pending',
      email,
      role: 'VIEWER',
      workspaceName: 'Team',
    });

    await http()
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD, fullName: 'New Person' })
      .expect(201);
    const login = await http()
      .post('/api/v1/auth/mobile/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const newcomer = { token: login.body.accessToken as string };

    await canReadProjects(newcomer, ws).expect(404);
    const accepted = await accept(newcomer, token).expect(200);
    expect(accepted.body.workspace.id).toBe(ws);
    expect(accepted.body.role).toBe('VIEWER');
    await canReadProjects(newcomer, ws).expect(200);
    expect((await preview(token).expect(200)).body.status).toBe('accepted');
  });

  it('gives the same response for registered and unregistered addresses', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    const registered = await invite(owner, ws, bob.email).expect(201);
    const unknown = await invite(
      owner,
      ws,
      `sec05-${runId}-nobody-${++seq}@example.test`,
    ).expect(201);

    expect(Object.keys(registered.body).sort()).toEqual(
      Object.keys(unknown.body).sort(),
    );
    expect(JSON.stringify(registered.body)).not.toContain(bob.fullName);
    expect(JSON.stringify(registered.body)).not.toContain(bob.id);
    // Both appear in the pending list in the same way.
    const pending = await http()
      .get(`/api/v1/workspaces/${ws}/invitations`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(
      (pending.body as Array<{ email: string }>).map((i) => i.email).sort(),
    ).toEqual([bob.email.toLowerCase(), unknown.body.email].sort());
    // Inviting does not create a membership for the existing account.
    expect(await membership(ws, bob.id)).toBeNull();
  });

  it('an invitation is single-use and concurrent accepts have one winner', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const carol = await newUser('carol');
    const ws = await newWorkspace(owner);
    const token = tokenOf(await invite(owner, ws, bob.email).expect(201));

    const results = await Promise.all([
      accept(bob, token),
      accept(carol, token),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
    const joined = await prisma.workspaceMembership.count({
      where: {
        workspaceId: ws,
        userId: { in: [bob.id, carol.id] },
        status: MembershipStatus.ACTIVE,
      },
    });
    expect(joined).toBe(1);
    await accept(bob, token).expect(410);
  });

  it('expired and revoked invitations cannot be used; a new one can be issued', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    const first = await invite(owner, ws, bob.email).expect(201);
    await invite(owner, ws, bob.email).expect(409); // one open invitation per address

    await prisma.workspaceInvitation.update({
      where: { id: first.body.invitationId as string },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await accept(bob, tokenOf(first)).expect(410);
    expect((await preview(tokenOf(first)).expect(200)).body.status).toBe(
      'expired',
    );

    const second = await invite(owner, ws, bob.email).expect(201);
    await http()
      .delete(
        `/api/v1/workspaces/${ws}/invitations/${second.body.invitationId}`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    await accept(bob, tokenOf(second)).expect(410);
    expect(await membership(ws, bob.id)).toBeNull();
  });

  it('resending issues a new link and the old one stops working', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    const first = await invite(owner, ws, bob.email).expect(201);
    const resent = await http()
      .post(
        `/api/v1/workspaces/${ws}/invitations/${first.body.invitationId}/resend`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);
    expect(tokenOf(resent)).not.toBe(tokenOf(first));
    await accept(bob, tokenOf(first)).expect(404);
    await accept(bob, tokenOf(resent)).expect(200);
  });

  it('only owners and admins manage invitations, and admins cannot invite admins', async () => {
    const owner = await newUser('owner');
    const member = await newUser('member');
    const admin = await newUser('admin');
    const ws = await newWorkspace(owner);
    await accept(
      member,
      tokenOf(await invite(owner, ws, member.email, 'MEMBER').expect(201)),
    ).expect(200);
    await accept(
      admin,
      tokenOf(await invite(owner, ws, admin.email, 'ADMIN').expect(201)),
    ).expect(200);

    await invite(member, ws, `sec05-${runId}-x-${++seq}@example.test`).expect(
      403,
    );
    await http()
      .get(`/api/v1/workspaces/${ws}/invitations`)
      .set('Authorization', `Bearer ${member.token}`)
      .expect(403);
    await invite(
      admin,
      ws,
      `sec05-${runId}-y-${++seq}@example.test`,
      'ADMIN',
    ).expect(403);
    await invite(
      admin,
      ws,
      `sec05-${runId}-z-${++seq}@example.test`,
      'OWNER',
    ).expect(403);
    await invite(
      admin,
      ws,
      `sec05-${runId}-w-${++seq}@example.test`,
      'VIEWER',
    ).expect(201);
  });

  it('active members cannot be invited again or re-join with a link', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    const token = tokenOf(await invite(owner, ws, bob.email).expect(201));
    await accept(bob, token).expect(200);
    await invite(owner, ws, bob.email).expect(409);
    await invite(owner, ws, owner.email).expect(409);
  });

  it('invitations to a deleted workspace cannot be previewed or accepted', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    const token = tokenOf(await invite(owner, ws, bob.email).expect(201));
    await prisma.workspace.update({
      where: { id: ws },
      data: { deletedAt: new Date() },
    });
    await preview(token).expect(404);
    await accept(bob, token).expect(404);
  });

  it('rejects unknown or malformed tokens', async () => {
    const bob = await newUser('bob');
    await preview('x'.repeat(43)).expect(404);
    await accept(bob, 'x'.repeat(43)).expect(404);
    await preview('short').expect(400);
  });

  it('legacy pending memberships created before email invitations can still be accepted', async () => {
    const owner = await newUser('owner');
    const bob = await newUser('bob');
    const ws = await newWorkspace(owner);
    await prisma.workspaceMembership.create({
      data: {
        workspaceId: ws,
        userId: bob.id,
        role: 'MEMBER',
        status: MembershipStatus.PENDING,
        invitationExpiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await http()
      .post(`/api/v1/workspaces/${ws}/members/accept`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(201);
    expect((await membership(ws, bob.id))!.status).toBe(
      MembershipStatus.ACTIVE,
    );
  });
});
