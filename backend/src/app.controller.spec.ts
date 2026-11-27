import { INestApplication, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { SKIP_RATE_LIMIT_KEY } from './common/rate-limit/rate-limit.policies';
import { RateLimitService } from './common/rate-limit/rate-limit.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController health endpoints (HTTP)', () => {
  let app: INestApplication<App>;
  const prisma = { $queryRaw: jest.fn() };
  const rateLimit = { ping: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: prisma },
        { provide: RateLimitService, useValue: rateLimit },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    rateLimit.ping.mockResolvedValue(undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const http = () => request(app.getHttpServer());

  it.each(['/health/live', '/'])(
    'GET %s reports liveness even when dependencies are down',
    async (path) => {
      prisma.$queryRaw.mockRejectedValue(new Error('db down'));
      rateLimit.ping.mockRejectedValue(new Error('redis down'));

      const res = await http().get(path).expect(200);
      expect(res.body).toEqual({ status: 'ok' });
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    },
  );

  it('GET /health/ready returns 200 when dependencies are up', async () => {
    const res = await http().get('/health/ready').expect(200);
    expect(res.body).toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('GET /health/ready returns 503 in the standard error format without internal details', async () => {
    rateLimit.ping.mockRejectedValue(
      new Error('connect ECONNREFUSED 10.0.0.7:6379 (password=s3cret)'),
    );

    const res = await http().get('/health/ready').expect(503);
    expect(res.body).toEqual({
      statusCode: 503,
      code: 'SERVICE_NOT_READY',
      message: 'Service is not ready.',
      details: { checks: { database: 'up', redis: 'down' } },
    });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('6379');
    expect(body).not.toContain('s3cret');
  });

  it('keeps every health endpoint out of rate limiting', () => {
    const reflector = new Reflector();
    for (const name of ['root', 'liveness', 'readiness'] as const) {
      const handler = Object.getOwnPropertyDescriptor(
        AppController.prototype,
        name,
      )?.value as () => unknown;
      expect(reflector.get(SKIP_RATE_LIMIT_KEY, handler)).toBe(true);
    }
  });
});
