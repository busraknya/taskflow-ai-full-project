/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return -- the ML stub and supertest bodies are untyped JSON */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { createServer, Server } from 'http';
import Redis from 'ioredis';
import { AddressInfo } from 'net';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { RiskModelService } from '../src/risk-model/risk-model.service';
import {
  RISK_MODEL_QUEUE,
  RISK_MODEL_SCHEDULER_ID,
} from '../src/risk-model/risk-model.queue';

/**
 * ML stage 4: opt-in, readiness and training jobs against real PostgreSQL
 * and Redis. The ML service is a stub that records requests; it is a test
 * double, not a model.
 */
const describeWithInfra =
  process.env.DATABASE_URL && process.env.JWT_SECRET && process.env.REDIS_HOST
    ? describe
    : describe.skip;

jest.setTimeout(60_000);
const PASSWORD = 'Password123';
const DAY = 86_400_000;
const READINESS_ENV = {
  RISK_READINESS_MIN_TASKS: '10',
  RISK_READINESS_MIN_PER_CLASS: '3',
  RISK_READINESS_MIN_SPAN_DAYS: '20',
  RISK_READINESS_MIN_TEST_TASKS: '3',
  RISK_READINESS_MIN_TEST_MINORITY: '1',
  RISK_READINESS_MIN_GROUPS: '1',
};

type Call = { method: string; url: string; body: any };

describeWithInfra('Risk model training against PostgreSQL (ML stage 4)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let service: RiskModelService;
  let stub: Server;
  const calls: Call[] = [];
  let models: Record<string, string | null> = {};
  const runId = randomUUID().slice(0, 8);
  const prefix = `ml4-${runId}-`;
  let seq = 0;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    stub = createServer((req, res) => {
      let raw = '';
      req.on('data', (c: Buffer) => (raw += c.toString()));
      req.on('end', () => {
        const body = raw ? JSON.parse(raw) : null;
        calls.push({ method: req.method!, url: req.url!, body });
        res.setHeader('content-type', 'application/json');
        const send = (status: number, data: unknown) => {
          res.statusCode = status;
          res.end(JSON.stringify(data));
        };
        const ws = req.url!.split('/')[2];
        if (req.url === '/train') {
          const version = `20261127T000000Z-${randomUUID().slice(0, 8)}`;
          models[body.workspaceId] = version;
          return send(200, {
            report: {
              decision: 'promoted',
              modelVersion: version,
              reasons: [],
              gates: [],
            },
            activeModelVersion: version,
          });
        }
        if (req.url === '/models/prune')
          return send(200, { deletedWorkspaceIds: [] });
        if (req.url!.endsWith('/rollback'))
          return send(409, { detail: 'NO_EARLIER_MODEL' });
        if (req.url!.endsWith('/deactivate')) {
          models[ws] = null;
          return send(200, { activeModelVersion: null });
        }
        if (req.method === 'GET' && req.url!.startsWith('/models/')) {
          const active = models[ws] ?? null;
          return send(200, {
            activeModelVersion: active,
            models: active
              ? [
                  {
                    modelVersion: active,
                    calibrated: false,
                    improvementOverBaseline: 0.05,
                  },
                ]
              : [],
          });
        }
        return send(503, { detail: 'MODEL_UNAVAILABLE' });
      });
    });
    await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
    process.env.ML_SERVICE_URL = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;

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
    service = moduleRef.get(RiskModelService);
  });

  beforeEach(async () => {
    // All requests come from 127.0.0.1; keep the real limiter, reset counters.
    const limiter = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD || undefined,
    });
    const keys = await limiter.keys('rate-limit:*');
    if (keys.length > 0) await limiter.del(...keys);
    await limiter.quit();
    calls.length = 0;
    models = {};
    Object.assign(process.env, READINESS_ENV);
  });

  afterAll(async () => {
    try {
      const workspaces = await prisma.workspace.findMany({
        where: { slug: { startsWith: prefix } },
        select: { id: true },
      });
      const ids = workspaces.map((w) => w.id);
      await prisma.task.deleteMany({ where: { workspaceId: { in: ids } } });
      await prisma.project.deleteMany({ where: { workspaceId: { in: ids } } });
      await prisma.workspace.deleteMany({ where: { id: { in: ids } } });
      await prisma.user.deleteMany({
        where: { email: { startsWith: prefix } },
      });
    } finally {
      await app?.close();
      await new Promise((resolve) => stub?.close(resolve));
      process.env = originalEnv;
    }
  });

  // ---------- helpers ----------

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function user(label: string) {
    const email = `${prefix}${label}-${++seq}@example.test`;
    const created = await prisma.user.create({
      data: {
        email,
        fullName: label,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      },
    });
    const login = await http()
      .post('/api/v1/auth/mobile/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return { id: created.id, token: login.body.accessToken as string };
  }

  /** Workspace with labelled history: tasks due in the past, half on time. */
  async function workspaceWithHistory(taskCount = 16) {
    const owner = await user('owner');
    const member = await user('member');
    const ws = await http()
      .post('/api/v1/workspaces')
      .set(auth(owner.token))
      .send({ name: 'Team', slug: `${prefix}ws-${++seq}` })
      .expect(201);
    const workspaceId = ws.body.id as string;
    await prisma.workspaceMembership.create({
      data: {
        workspaceId,
        userId: member.id,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });
    const project = await prisma.project.create({
      data: { workspaceId, name: 'Project' },
    });
    const now = Date.now();
    for (let i = 0; i < taskCount; i += 1) {
      const created = new Date(now - (70 - i * 4) * DAY);
      const due = new Date(created.getTime() + 5 * DAY);
      const onTime = i % 2 === 0;
      const doneAt = new Date(due.getTime() + (onTime ? -DAY : DAY));
      const task = await prisma.task.create({
        data: {
          workspaceId,
          projectId: project.id,
          title: `T${i}`,
          status: 'DONE',
          dueDate: due,
          completedAt: doneAt,
          assigneeId: owner.id,
        },
      });
      await prisma.taskEvent.createMany({
        data: [
          {
            workspaceId,
            taskId: task.id,
            type: 'CREATED',
            occurredAt: created,
            newValue: {
              status: 'TODO',
              priority: 1,
              assigneeId: owner.id,
              dueDate: due.toISOString(),
              dueDateIsDateOnly: false,
              completedAt: null,
              commentCount: 0,
            },
          },
          {
            workspaceId,
            taskId: task.id,
            type: 'STATUS_CHANGED',
            occurredAt: doneAt,
            oldValue: { status: 'TODO' },
            newValue: { status: 'DONE' },
          },
        ],
      });
    }
    return { workspaceId, owner, member };
  }

  async function waitFor<T>(
    read: () => Promise<T>,
    done: (v: T) => boolean,
  ): Promise<T> {
    for (let i = 0; i < 100; i += 1) {
      const value = await read();
      if (done(value)) return value;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('timed out waiting for background job');
  }

  const status = (workspaceId: string, token: string) =>
    http().get(`/api/v1/workspaces/${workspaceId}/risk-model`).set(auth(token));

  const latestRun = (workspaceId: string) =>
    prisma.riskModelTraining.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

  // ---------- tests ----------

  it('lets members view the status but only owners/admins enable training', async () => {
    const { workspaceId, owner, member } = await workspaceWithHistory();
    const initial = await status(workspaceId, member.token).expect(200);
    expect(initial.body).toMatchObject({
      trainingEnabled: false,
      activeModel: null,
      readiness: null,
      trainingInProgress: false,
    });
    await http()
      .patch(`/api/v1/workspaces/${workspaceId}/risk-model`)
      .set(auth(member.token))
      .send({ trainingEnabled: true })
      .expect(403);
    await http()
      .post(`/api/v1/workspaces/${workspaceId}/risk-model/train`)
      .set(auth(owner.token))
      .expect(409); // not enabled yet
    expect(calls.filter((c) => c.url === '/train')).toHaveLength(0);
  });

  it('computes readiness on enable and trains on this workspace rows only', async () => {
    const other = await workspaceWithHistory();
    const { workspaceId, owner, member } = await workspaceWithHistory();
    await http()
      .patch(`/api/v1/workspaces/${workspaceId}/risk-model`)
      .set(auth(owner.token))
      .send({ trainingEnabled: true })
      .expect(200);

    // Enabling enqueues readiness; ready and never trained => trains now.
    const run = await waitFor(
      () => latestRun(workspaceId),
      (r) => r?.status === 'PROMOTED',
    );
    expect(run).toMatchObject({ trigger: 'SCHEDULED', labelableTasks: 16 });

    const trainCalls = calls.filter((c) => c.url === '/train');
    expect(trainCalls).toHaveLength(1);
    const ownTaskIds = new Set(
      (
        await prisma.task.findMany({
          where: { workspaceId },
          select: { id: true },
        })
      ).map((t) => t.id),
    );
    const sent: Array<{ taskId: string; label: number }> =
      trainCalls[0].body.rows;
    expect(trainCalls[0].body.workspaceId).toBe(workspaceId);
    expect(sent.length).toBeGreaterThan(16);
    expect(sent.every((r) => ownTaskIds.has(r.taskId))).toBe(true);
    expect(new Set(sent.map((r) => r.label))).toEqual(new Set([0, 1]));
    expect(other.workspaceId).not.toBe(workspaceId);

    const view = await waitFor(
      async () => (await status(workspaceId, member.token).expect(200)).body,
      (b) => b.activeModel !== null,
    );
    expect(view).toMatchObject({
      trainingEnabled: true,
      readiness: { ready: true, labelableTasks: 16 },
      lastRun: { status: 'PROMOTED', trigger: 'SCHEDULED' },
    });
  });

  it('records NOT_READY for a manual run without enough history', async () => {
    Object.assign(process.env, { RISK_READINESS_MIN_TASKS: '1000' });
    const { workspaceId, owner } = await workspaceWithHistory();
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { riskTrainingEnabled: true },
    });
    const res = await http()
      .post(`/api/v1/workspaces/${workspaceId}/risk-model/train`)
      .set(auth(owner.token))
      .expect(202);
    expect(res.body).toMatchObject({ status: 'QUEUED', trigger: 'MANUAL' });
    const run = await waitFor(
      () => latestRun(workspaceId),
      (r) => r?.status === 'NOT_READY',
    );
    expect((run!.readiness as { ready: boolean }).ready).toBe(false);
    expect(calls.filter((c) => c.url === '/train')).toHaveLength(0);
  });

  it('refuses a second manual run while one is queued', async () => {
    const { workspaceId, owner } = await workspaceWithHistory();
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { riskTrainingEnabled: true },
    });
    await prisma.riskModelTraining.create({
      data: { workspaceId, trigger: 'MANUAL', status: 'RUNNING' },
    });
    await http()
      .post(`/api/v1/workspaces/${workspaceId}/risk-model/train`)
      .set(auth(owner.token))
      .expect(409);
  });

  it('deactivates the model when training is disabled, and maps rollback errors', async () => {
    const { workspaceId, owner } = await workspaceWithHistory();
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { riskTrainingEnabled: true },
    });
    models[workspaceId] = '20261127T000000Z-aaaaaaaa';
    await http()
      .post(`/api/v1/workspaces/${workspaceId}/risk-model/rollback`)
      .set(auth(owner.token))
      .expect(409);
    const res = await http()
      .patch(`/api/v1/workspaces/${workspaceId}/risk-model`)
      .set(auth(owner.token))
      .send({ trainingEnabled: false })
      .expect(200);
    expect(res.body).toMatchObject({
      trainingEnabled: false,
      activeModel: null,
    });
    expect(
      calls.some((c) => c.url === `/models/${workspaceId}/deactivate`),
    ).toBe(true);
  });

  it('nightly scheduling prunes models of removed workspaces and evaluates the rest', async () => {
    const { workspaceId } = await workspaceWithHistory(4);
    const count = await service.scheduleAll(String(Date.now()));
    expect(count).toBeGreaterThan(0);
    const prune = calls.find((c) => c.url === '/models/prune');
    expect(prune!.body.keepWorkspaceIds).toContain(workspaceId);
    await waitFor(
      () => prisma.workspace.findUnique({ where: { id: workspaceId } }),
      (w) => w?.riskReadinessAt !== null,
    );
  });

  it('registers the nightly training scheduler', async () => {
    const client = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD || undefined,
    });
    const record = await client.hgetall(
      `bull:${RISK_MODEL_QUEUE}:repeat:${RISK_MODEL_SCHEDULER_ID}`,
    );
    await client.quit();
    expect(record).toMatchObject({
      pattern: '0 3 * * *',
      tz: 'UTC',
      name: 'schedule-all',
    });
  });
});
