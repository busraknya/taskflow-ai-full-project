/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import type { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { join } from 'path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RiskInferenceService } from '../src/ai/risk-inference.service';
import {
  RISK_ASSESSMENT_QUEUE,
  RISK_RECOMPUTE_SCHEDULER_ID,
} from '../src/ai/risk-assessment.queue';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * ML stage 2: live inference against real PostgreSQL and Redis. The ML
 * service is replaced by a stub that validates requests against
 * ml-service/feature_spec.json and returns fixed levels; it is a test double,
 * not a model.
 */
const describeWithInfra =
  process.env.DATABASE_URL && process.env.JWT_SECRET && process.env.REDIS_HOST
    ? describe
    : describe.skip;

const PASSWORD = 'Password123';
const SPEC = JSON.parse(
  readFileSync(join(__dirname, '../../ml-service/feature_spec.json'), 'utf8'),
) as { version: string; features: Array<{ name: string }> };
const SPEC_NAMES = SPEC.features.map((f) => f.name).sort();

type StubRequest = {
  workspaceId: string;
  featureSpecVersion: string;
  items: Array<{ taskId: string; features: Record<string, number> }>;
};

describeWithInfra('Risk inference against PostgreSQL (ML stage 2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let inference: RiskInferenceService;
  let stub: Server;
  let stubMode: 'predict' | 'no-model' = 'predict';
  const received: StubRequest[] = [];
  const contractErrors: string[] = [];
  const runId = randomUUID().slice(0, 8);
  const prefix = `ml2-${runId}-`;
  let seq = 0;
  const originalMlUrl = process.env.ML_SERVICE_URL;

  beforeAll(async () => {
    stub = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => (body += chunk.toString()));
      req.on('end', () => {
        const parsed = JSON.parse(body) as StubRequest;
        received.push(parsed);
        if (req.url !== '/predict/batch') contractErrors.push(`url ${req.url}`);
        if (parsed.featureSpecVersion !== SPEC.version)
          contractErrors.push('version');
        for (const item of parsed.items) {
          const names = Object.keys(item.features).sort();
          if (JSON.stringify(names) !== JSON.stringify(SPEC_NAMES)) {
            contractErrors.push(`features of ${item.taskId}`);
          }
        }
        res.setHeader('content-type', 'application/json');
        if (stubMode === 'no-model') {
          res.statusCode = 503;
          res.end(JSON.stringify({ detail: 'MODEL_UNAVAILABLE' }));
          return;
        }
        res.end(
          JSON.stringify({
            modelVersion: 'stub-model',
            results: parsed.items.map((i) => ({
              taskId: i.taskId,
              riskLevel: 'HIGH',
              probability: null,
            })),
          }),
        );
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
    inference = moduleRef.get(RiskInferenceService);
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
    stubMode = 'predict';
    received.length = 0;
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
      if (originalMlUrl === undefined) delete process.env.ML_SERVICE_URL;
      else process.env.ML_SERVICE_URL = originalMlUrl;
    }
  });

  // ---------- helpers ----------

  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function newWorkspace() {
    const email = `${prefix}owner-${++seq}@example.test`;
    await prisma.user.create({
      data: {
        email,
        fullName: 'Owner',
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      },
    });
    const login = await http()
      .post('/api/v1/auth/mobile/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const token = login.body.accessToken as string;
    const ws = await http()
      .post('/api/v1/workspaces')
      .set(auth(token))
      .send({ name: 'Team', slug: `${prefix}ws-${++seq}` })
      .expect(201);
    // Predictions require the owner/admin opt-in (ML stage 4).
    await prisma.workspace.update({
      where: { id: ws.body.id as string },
      data: { riskTrainingEnabled: true },
    });
    const project = await http()
      .post(`/api/v1/workspaces/${ws.body.id}/projects`)
      .set(auth(token))
      .send({ name: 'Project' })
      .expect(201);
    return {
      token,
      id: ws.body.id as string,
      projectId: project.body.id as string,
    };
  }

  async function newTask(
    ws: Awaited<ReturnType<typeof newWorkspace>>,
    body: object,
  ) {
    const res = await http()
      .post(`/api/v1/workspaces/${ws.id}/tasks`)
      .set(auth(ws.token))
      .send({ title: 'Task', projectId: ws.projectId, ...body })
      .expect(201);
    return res.body as { id: string; version: number };
  }

  const latestAssessment = (taskId: string) =>
    prisma.riskAssessment.findFirst({
      where: { taskId },
      orderBy: { computedAt: 'desc' },
    });

  // ---------- tests ----------

  it('predicts only the requested workspace and stores the features sent', async () => {
    const wsA = await newWorkspace();
    const wsB = await newWorkspace();
    const a1 = await newTask(wsA, { dueDate: '2099-01-10' });
    await newTask(wsA, {}); // no due date: never sent to the model
    const b1 = await newTask(wsB, { dueDate: '2099-01-10' });

    const summary = await inference.assess(wsA.id);
    expect(summary).toMatchObject({
      candidates: 2,
      predicted: 1,
      ineligible: { 'no-due-date': 1 },
    });
    expect(contractErrors).toEqual([]);
    expect(received.map((r) => r.workspaceId)).toEqual([wsA.id]);
    expect(received.flatMap((r) => r.items.map((i) => i.taskId))).toEqual([
      a1.id,
    ]);

    const stored = await latestAssessment(a1.id);
    expect(stored).toMatchObject({
      riskLevel: 'HIGH',
      riskScore: null,
      modelVersion: 'stub-model',
      featureSpecVersion: SPEC.version,
    });
    expect(Object.keys(stored!.featureSnapshot as object).sort()).toEqual(
      SPEC_NAMES,
    );
    expect(received[0].items[0].features).toEqual(stored!.featureSnapshot);

    // Nothing was computed for the other workspace by this call.
    const otherWorkspaceRows = await prisma.riskAssessment.count({
      where: {
        taskId: b1.id,
        modelVersion: 'stub-model',
        computedAt: { gte: stored!.computedAt },
      },
    });
    expect(otherWorkspaceRows).toBe(0);
  });

  it('withdraws the prediction when the task is done, and the API shows no level', async () => {
    const ws = await newWorkspace();
    const task = await newTask(ws, { dueDate: '2099-01-10' });
    await inference.assess(ws.id, [task.id]);
    expect((await latestAssessment(task.id))?.riskLevel).toBe('HIGH');

    await http()
      .patch(`/api/v1/workspaces/${ws.id}/tasks/${task.id}`)
      .set(auth(ws.token))
      .send({ version: task.version, status: 'DONE' })
      .expect(200);
    await inference.assess(ws.id, [task.id]);

    expect(await latestAssessment(task.id)).toMatchObject({
      riskLevel: 'UNAVAILABLE',
      modelVersion: 'none',
      reason: 'done',
    });
    const res = await http()
      .get(`/api/v1/workspaces/${ws.id}/tasks/${task.id}`)
      .set(auth(ws.token))
      .expect(200);
    const assessments = res.body.riskAssessments as Array<{
      riskLevel: string;
    }>;
    expect(assessments.map((r) => r.riskLevel)).toEqual(['UNAVAILABLE']);
  });

  it('stores no prediction when the ML service has no model', async () => {
    stubMode = 'no-model';
    const ws = await newWorkspace();
    const task = await newTask(ws, { dueDate: '2099-01-10' });
    const summary = await inference.assess(ws.id, [task.id]);
    expect(summary).toMatchObject({ predicted: 0, modelUnavailable: true });
    expect(
      await prisma.riskAssessment.count({
        where: { taskId: task.id, NOT: { riskLevel: 'UNAVAILABLE' } },
      }),
    ).toBe(0);
  });

  it('does not predict tasks whose history predates TaskEvent', async () => {
    const ws = await newWorkspace();
    const task = await newTask(ws, { dueDate: '2099-01-10' });
    // Simulate a task that existed before the migration: only a SNAPSHOT.
    await prisma.taskEvent.updateMany({
      where: { taskId: task.id, type: 'CREATED' },
      data: { type: 'SNAPSHOT', source: 'BACKFILL' },
    });
    const summary = await inference.assess(ws.id, [task.id]);
    expect(summary.ineligible).toEqual({ 'incomplete-history': 1 });
    expect(received).toHaveLength(0);
  });

  it('registers the daily recompute scheduler', async () => {
    const queue = app.get<Queue>(getQueueToken(RISK_ASSESSMENT_QUEUE));
    // Read the scheduler record directly: Queue.getJobSchedulers() fails in
    // the installed bullmq/ioredis combination when parsing the reply.
    const client = new Redis({
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD || undefined,
    });
    const prefixKey = `bull:${RISK_ASSESSMENT_QUEUE}`;
    expect(
      await client.zscore(`${prefixKey}:repeat`, RISK_RECOMPUTE_SCHEDULER_ID),
    ).not.toBeNull();
    const record = await client.hgetall(
      `${prefixKey}:repeat:${RISK_RECOMPUTE_SCHEDULER_ID}`,
    );
    expect(record).toMatchObject({
      pattern: '0 2 * * *',
      tz: 'UTC',
      name: 'recompute-all',
    });
    await client.quit();
    const next = await queue.getDelayed();
    expect(next.map((job) => job.name)).toContain('recompute-all');
  });
});
