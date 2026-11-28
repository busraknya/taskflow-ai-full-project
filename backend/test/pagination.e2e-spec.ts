/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Keyset pagination of task and audit lists against real PostgreSQL. Ties in
 * the sort key (equal positions, equal timestamps) are the case that breaks
 * offset or single-column cursors, so the fixtures are built around them.
 */
const describeWithInfra =
  process.env.DATABASE_URL && process.env.JWT_SECRET && process.env.REDIS_HOST
    ? describe
    : describe.skip;

const PASSWORD = 'Password123';

interface ListedRow {
  id: string;
  status?: string;
  workspaceId?: string;
}

describeWithInfra('List pagination against PostgreSQL', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const prefix = `page-${randomUUID().slice(0, 8)}-`;
  let token: string;
  let userId: string;
  let workspaceId: string;
  let otherWorkspaceId: string;
  let projectId: string;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    prisma = moduleRef.get(PrismaService);
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD || undefined,
    });
    const keys = await redis.keys('rate-limit:*');
    if (keys.length > 0) await redis.del(...keys);

    const email = `${prefix}owner@example.test`;
    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'Owner',
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      },
    });
    userId = user.id;
    const login = await http()
      .post('/api/v1/auth/mobile/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    token = login.body.accessToken;

    const newWorkspace = async (slug: string) =>
      (
        await http()
          .post('/api/v1/workspaces')
          .set(auth())
          .send({ name: 'Team', slug: `${prefix}${slug}` })
          .expect(201)
      ).body.id as string;
    workspaceId = await newWorkspace('ws');
    otherWorkspaceId = await newWorkspace('other');
    const newProject = async (wsId: string) =>
      (
        await http()
          .post(`/api/v1/workspaces/${wsId}/projects`)
          .set(auth())
          .send({ name: 'Project' })
          .expect(201)
      ).body.id as string;
    projectId = await newProject(workspaceId);
    const secondProjectId = await newProject(workspaceId);

    const task = (status: string, position: number, extra = {}) => ({
      workspaceId,
      projectId,
      title: `${status}-${position}`,
      status: status as never,
      position,
      ...extra,
    });
    await prisma.task.createMany({
      data: [
        // Five TODO tasks share position 0, so only the id breaks the tie.
        ...Array.from({ length: 5 }, () => task('TODO', 0)),
        task('TODO', 1),
        task('DONE', 0),
        task('DONE', 2),
        // Never listed: soft-deleted, or in another project.
        task('TODO', 0, { deletedAt: new Date() }),
        task('TODO', 0, { projectId: secondProjectId }),
      ],
    });

    const at = new Date('2026-11-01T10:00:00.000Z');
    const entry = (wsId: string, createdAt: Date) => ({
      workspaceId: wsId,
      actorId: userId,
      entityType: 'TASK',
      entityId: randomUUID(),
      action: 'TEST',
      createdAt,
    });
    await prisma.auditLogEntry.createMany({
      data: [
        // Four entries with the same timestamp, plus older ones.
        ...Array.from({ length: 4 }, () => entry(workspaceId, at)),
        entry(workspaceId, new Date(at.getTime() - 1)),
        entry(workspaceId, new Date(at.getTime() - 60_000)),
        entry(otherWorkspaceId, at),
      ],
    });
  });

  afterAll(async () => {
    try {
      const workspaceIds = [workspaceId, otherWorkspaceId].filter(Boolean);
      await prisma.task.deleteMany({
        where: { workspaceId: { in: workspaceIds } },
      });
      await prisma.project.deleteMany({
        where: { workspaceId: { in: workspaceIds } },
      });
      await prisma.workspace.deleteMany({
        where: { id: { in: workspaceIds } },
      });
      await prisma.user.deleteMany({
        where: { email: { startsWith: prefix } },
      });
    } finally {
      await redis?.quit();
      await app?.close();
    }
  });

  /** Follows nextCursor until the last page and returns every page. */
  async function walk(path: string, params: Record<string, string>) {
    const pages: Array<{ items: ListedRow[]; nextCursor: string | null }> = [];
    let cursor: string | null = null;
    do {
      const res: request.Response = await http()
        .get(path)
        .query(cursor ? { ...params, cursor } : params)
        .set(auth())
        .expect(200);
      pages.push(res.body);
      cursor = res.body.nextCursor;
    } while (cursor && pages.length < 20);
    return pages;
  }

  it('pages one status column in (position, id) order without gaps or repeats', async () => {
    const pages = await walk(`/api/v1/workspaces/${workspaceId}/tasks`, {
      projectId,
      status: 'TODO',
      limit: '2',
    });

    expect(pages.map((p) => p.items.length)).toEqual([2, 2, 2]);
    expect(pages[pages.length - 1].nextCursor).toBeNull();

    const items = pages.flatMap((p) => p.items);
    const expected = await prisma.task.findMany({
      where: { workspaceId, projectId, status: 'TODO', deletedAt: null },
      orderBy: [{ position: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    expect(expected).toHaveLength(6);
    expect(items.map((t) => t.id)).toEqual(expected.map((t) => t.id));
    expect(items.every((t) => t.status === 'TODO')).toBe(true);
  });

  it('lists every status of a project when no status is given', async () => {
    const res = await http()
      .get(`/api/v1/workspaces/${workspaceId}/tasks`)
      .query({ projectId })
      .set(auth())
      .expect(200);

    expect(res.body.items).toHaveLength(8);
    expect(res.body.nextCursor).toBeNull();
    // Assignee and current risk stay included for the board.
    expect(res.body.items[0]).toHaveProperty('assignee');
    expect(res.body.items[0]).toHaveProperty('riskAssessments');
  });

  it('pages audit entries newest first, breaking timestamp ties by id', async () => {
    const pages = await walk(`/api/v1/workspaces/${workspaceId}/audit`, {
      limit: '3',
    });

    const items = pages.flatMap((p) => p.items);
    const expected = await prisma.auditLogEntry.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    // The fixtures plus the workspace-creation entry; never the other workspace.
    expect(expected.length).toBeGreaterThanOrEqual(6);
    expect(items.map((e) => e.id)).toEqual(expected.map((e) => e.id));
    expect(items.every((e) => e.workspaceId === workspaceId)).toBe(true);
    expect(pages[pages.length - 1].nextCursor).toBeNull();
  });

  it.each([
    ['a malformed cursor', { cursor: 'not-a-cursor' }, 'INVALID_CURSOR'],
    [
      'a cursor of the wrong shape',
      { cursor: Buffer.from('["x",1]').toString('base64url') },
      'INVALID_CURSOR',
    ],
    ['a limit above the maximum', { limit: '201' }, undefined],
    ['a zero limit', { limit: '0' }, undefined],
    ['an unknown status', { status: 'LATER' }, undefined],
  ])('rejects %s on the task list', async (_label, query, code) => {
    const res = await http()
      .get(`/api/v1/workspaces/${workspaceId}/tasks`)
      .query({ projectId, ...query })
      .set(auth())
      .expect(400);
    if (code) expect(res.body.code).toBe(code);
  });

  it('rejects a task cursor on the audit list', async () => {
    const page = await http()
      .get(`/api/v1/workspaces/${workspaceId}/tasks`)
      .query({ projectId, limit: '1' })
      .set(auth())
      .expect(200);

    const res = await http()
      .get(`/api/v1/workspaces/${workspaceId}/audit`)
      .query({ cursor: page.body.nextCursor })
      .set(auth())
      .expect(400);
    expect(res.body.code).toBe('INVALID_CURSOR');
  });
});
