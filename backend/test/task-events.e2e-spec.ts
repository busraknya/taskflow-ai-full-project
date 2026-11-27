/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  replayTaskEvents,
  toHistoryState,
} from '../src/task-events/task-history';
import { generateOperations } from './support/task-simulator';

/**
 * ML stage 1: TaskEvent capture against real PostgreSQL and Redis. Requires a
 * migrated, disposable database (DATABASE_URL), a disposable Redis and
 * JWT_SECRET. Only data created by this suite is touched.
 */
const describeWithInfra =
  process.env.DATABASE_URL && process.env.JWT_SECRET && process.env.REDIS_HOST
    ? describe
    : describe.skip;

const PASSWORD = 'Password123';

describeWithInfra('TaskEvent history against PostgreSQL (ML stage 1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: Redis;
  const runId = randomUUID().slice(0, 8);
  const prefix = `ml1-${runId}-`;
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
    await app.listen(0, '127.0.0.1');
    prisma = moduleRef.get(PrismaService);
    redis = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD || undefined,
    });
  });

  beforeEach(async () => {
    const keys = await redis.keys('rate-limit:*');
    if (keys.length > 0) await redis.del(...keys);
  });

  afterAll(async () => {
    try {
      // Tasks restrict project deletion, so remove them first.
      const workspaces = await prisma.workspace.findMany({
        where: { slug: { startsWith: prefix } },
        select: { id: true },
      });
      const workspaceIds = workspaces.map((w) => w.id);
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

  // ---------- helpers ----------

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function newUser(label: string) {
    const email = `${prefix}${label}-${++seq}@example.test`;
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

  async function newWorkspace(
    owner: { token: string },
    extra: Record<string, unknown> = {},
  ) {
    const res = await http()
      .post('/api/v1/workspaces')
      .set(auth(owner.token))
      .send({ name: 'Team', slug: `${prefix}ws-${++seq}`, ...extra })
      .expect(201);
    return res.body as { id: string; timezone: string };
  }

  async function addMember(
    workspaceId: string,
    userId: string,
    role = 'MEMBER',
  ) {
    await prisma.workspaceMembership.create({
      data: {
        workspaceId,
        userId,
        role: role as never,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
  }

  async function newProject(token: string, workspaceId: string) {
    const res = await http()
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set(auth(token))
      .send({ name: 'Project' })
      .expect(201);
    return res.body.id as string;
  }

  async function newTask(
    token: string,
    workspaceId: string,
    projectId: string,
    body: Record<string, unknown> = {},
  ) {
    const res = await http()
      .post(`/api/v1/workspaces/${workspaceId}/tasks`)
      .set(auth(token))
      .send({ title: 'Task', projectId, ...body })
      .expect(201);
    return res.body as { id: string; version: number };
  }

  const patchTask = (
    token: string,
    workspaceId: string,
    taskId: string,
    body: Record<string, unknown>,
  ) =>
    http()
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/${taskId}`)
      .set(auth(token))
      .send(body);

  async function eventsOf(taskId: string) {
    return prisma.taskEvent.findMany({
      where: { taskId },
      orderBy: { seq: 'asc' },
    });
  }

  /** Replayed history must equal the stored task row exactly. */
  async function expectReplayMatchesRow(taskId: string) {
    const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
    const commentCount = await prisma.comment.count({
      where: { taskId, deletedAt: null },
    });
    const events = await eventsOf(taskId);
    for (const event of events) {
      expect(event.workspaceId).toBe(task.workspaceId);
    }
    expect(replayTaskEvents(events)).toEqual(
      toHistoryState(task, commentCount),
    );
  }

  // ---------- tests ----------

  it('replays simulated task lifecycles to exactly the stored state (seeded)', async () => {
    const workspaces: Array<{
      id: string;
      owner: { token: string };
      project: string;
      members: string[];
    }> = [];
    for (let w = 0; w < 2; w += 1) {
      const owner = await newUser(`owner${w}`);
      const ws = await newWorkspace(owner);
      const members = [owner.id];
      for (let m = 0; m < 2; m += 1) {
        const member = await newUser(`member${w}${m}`);
        await addMember(ws.id, member.id);
        members.push(member.id);
      }
      workspaces.push({
        id: ws.id,
        owner,
        project: await newProject(owner.token, ws.id),
        members,
      });
    }

    const taskIds: string[] = [];
    for (let t = 0; t < 8; t += 1) {
      const ws = workspaces[t % workspaces.length];
      const task = await newTask(ws.owner.token, ws.id, ws.project, {
        dueDate: t % 2 === 0 ? '2026-12-10' : undefined,
      });
      taskIds.push(task.id);
      let version = task.version;
      const comments: string[] = [];

      for (const op of generateOperations(1_000 + t, 20, ws.members.length)) {
        if (op.kind === 'addComment') {
          const res = await http()
            .post(`/api/v1/workspaces/${ws.id}/tasks/${task.id}/comments`)
            .set(auth(ws.owner.token))
            .send({ body: op.body })
            .expect(201);
          comments.push(res.body.id as string);
          continue;
        }
        if (op.kind === 'deleteComment') {
          const commentId = comments.pop();
          if (commentId) {
            await http()
              .delete(
                `/api/v1/workspaces/${ws.id}/tasks/${task.id}/comments/${commentId}`,
              )
              .set(auth(ws.owner.token))
              .expect(200);
          }
          continue;
        }
        const body: Record<string, unknown> = { version };
        if (op.kind === 'status') body.status = op.status;
        if (op.kind === 'dueDate') body.dueDate = op.value;
        if (op.kind === 'priority') body.priority = op.priority;
        if (op.kind === 'title') body.title = op.title;
        if (op.kind === 'assignee') {
          body.assigneeId =
            op.assigneeIndex === null ? null : ws.members[op.assigneeIndex];
        }
        const res = await patchTask(
          ws.owner.token,
          ws.id,
          task.id,
          body,
        ).expect(200);
        version = res.body.version as number;
      }
    }

    for (const taskId of taskIds) {
      await expectReplayMatchesRow(taskId);
    }
  });

  it('rolls back the task update when its events cannot be written', async () => {
    const owner = await newUser('rollback');
    const ws = await newWorkspace(owner);
    const project = await newProject(owner.token, ws.id);
    const task = await newTask(owner.token, ws.id, project);
    const eventsBefore = (await eventsOf(task.id)).length;

    // Fail the TaskEvent insert inside the real transaction.
    const original = prisma.$transaction.bind(prisma);
    const spy = jest
      .spyOn(prisma, '$transaction')
      .mockImplementation((callback: (tx: unknown) => Promise<unknown>) =>
        original(async (tx) => {
          const failing = new Proxy(tx, {
            get(target, property, receiver) {
              if (property === 'taskEvent') {
                return {
                  createMany: () =>
                    Promise.reject(new Error('event write failed')),
                };
              }
              return Reflect.get(target, property, receiver) as unknown;
            },
          });
          return callback(failing);
        }),
      );

    try {
      await patchTask(owner.token, ws.id, task.id, {
        version: task.version,
        status: 'DONE',
      }).expect(500);
    } finally {
      spy.mockRestore();
    }

    const stored = await prisma.task.findUniqueOrThrow({
      where: { id: task.id },
    });
    expect(stored).toMatchObject({
      status: 'TODO',
      version: task.version,
      completedAt: null,
    });
    expect(await eventsOf(task.id)).toHaveLength(eventsBefore);
  });

  it('records events for exactly one of two concurrent updates to the same version', async () => {
    const owner = await newUser('concurrent');
    const ws = await newWorkspace(owner);
    const project = await newProject(owner.token, ws.id);
    const task = await newTask(owner.token, ws.id, project);

    const responses = await Promise.all([
      patchTask(owner.token, ws.id, task.id, {
        version: task.version,
        status: 'IN_PROGRESS',
      }),
      patchTask(owner.token, ws.id, task.id, {
        version: task.version,
        status: 'DONE',
      }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);

    const statusEvents = (await eventsOf(task.id)).filter(
      (e) => e.type === 'STATUS_CHANGED',
    );
    expect(statusEvents).toHaveLength(1);
    await expectReplayMatchesRow(task.id);
  });

  it('records a single COMMENT_DELETED event for concurrent deletes', async () => {
    const owner = await newUser('comments');
    const ws = await newWorkspace(owner);
    const project = await newProject(owner.token, ws.id);
    const task = await newTask(owner.token, ws.id, project);
    const comment = await http()
      .post(`/api/v1/workspaces/${ws.id}/tasks/${task.id}/comments`)
      .set(auth(owner.token))
      .send({ body: 'to delete' })
      .expect(201);

    const url = `/api/v1/workspaces/${ws.id}/tasks/${task.id}/comments/${comment.body.id}`;
    const responses = await Promise.all([
      http().delete(url).set(auth(owner.token)),
      http().delete(url).set(auth(owner.token)),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 404]);

    const deletions = (await eventsOf(task.id)).filter(
      (e) => e.type === 'COMMENT_DELETED',
    );
    expect(deletions).toHaveLength(1);
    await expectReplayMatchesRow(task.id);
  });

  it('stores date-only and explicit-time due dates distinctly', async () => {
    const owner = await newUser('due');
    const ws = await newWorkspace(owner);
    const project = await newProject(owner.token, ws.id);

    const dateOnly = await newTask(owner.token, ws.id, project, {
      dueDate: '2026-12-24',
    });
    const exact = await newTask(owner.token, ws.id, project, {
      dueDate: '2026-12-24T15:30:00+03:00',
    });

    expect(
      await prisma.task.findUniqueOrThrow({ where: { id: dateOnly.id } }),
    ).toMatchObject({
      dueDate: new Date('2026-12-24T00:00:00.000Z'),
      dueDateIsDateOnly: true,
    });
    expect(
      await prisma.task.findUniqueOrThrow({ where: { id: exact.id } }),
    ).toMatchObject({
      dueDate: new Date('2026-12-24T12:30:00.000Z'),
      dueDateIsDateOnly: false,
    });
  });

  it('marks offline changes with the client time and OFFLINE_SYNC source', async () => {
    const owner = await newUser('offline');
    const ws = await newWorkspace(owner);
    const project = await newProject(owner.token, ws.id);
    const task = await newTask(owner.token, ws.id, project);

    await patchTask(owner.token, ws.id, task.id, {
      version: task.version,
      status: 'IN_PROGRESS',
      clientOccurredAt: '2026-11-20T08:00:00.000Z',
    }).expect(200);

    const [, change] = await eventsOf(task.id);
    expect(change).toMatchObject({
      type: 'STATUS_CHANGED',
      source: 'OFFLINE_SYNC',
      clientOccurredAt: new Date('2026-11-20T08:00:00.000Z'),
    });
    // Server time stays authoritative.
    expect(change.occurredAt.getTime()).toBeGreaterThan(
      new Date('2026-11-20T08:00:00.000Z').getTime(),
    );
  });

  it('stores the workspace time zone and lets only owners and admins change it', async () => {
    const owner = await newUser('tz-owner');
    const member = await newUser('tz-member');
    const ws = await newWorkspace(owner, { timezone: 'Europe/Istanbul' });
    expect(ws.timezone).toBe('Europe/Istanbul');
    expect((await newWorkspace(owner)).timezone).toBe('UTC');

    await http()
      .post('/api/v1/workspaces')
      .set(auth(owner.token))
      .send({
        name: 'Bad',
        slug: `${prefix}bad-${++seq}`,
        timezone: 'Mars/Olympus',
      })
      .expect(400);

    await addMember(ws.id, member.id);
    await http()
      .patch(`/api/v1/workspaces/${ws.id}`)
      .set(auth(member.token))
      .send({ timezone: 'America/New_York' })
      .expect(403);
    const res = await http()
      .patch(`/api/v1/workspaces/${ws.id}`)
      .set(auth(owner.token))
      .send({ timezone: 'America/New_York' })
      .expect(200);
    expect(res.body.timezone).toBe('America/New_York');
  });
});
