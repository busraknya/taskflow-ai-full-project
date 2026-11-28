/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import helmet from 'helmet';
import request from 'supertest';
import { applySecurityHeaders, buildHelmetOptions } from './security-headers';

@Controller()
class ProbeController {
  @Get('probe')
  probe() {
    return { ok: true };
  }
}

async function createApp(
  configure: (app: INestApplication) => void,
): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController],
  }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configure(app);
  await app.init();
  return app;
}

describe('API security headers (Helmet)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('sends the expected headers on API responses', async () => {
    app = await createApp(applySecurityHeaders);
    const res = await request(app.getHttpServer()).get('/probe').expect(200);

    expect(res.headers['content-security-policy']).toBe(
      "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('also protects error responses', async () => {
    app = await createApp(applySecurityHeaders);
    const res = await request(app.getHttpServer()).get('/missing').expect(404);

    expect(res.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sends HSTS only in production', async () => {
    app = await createApp((a) =>
      a.use(helmet(buildHelmetOptions('production'))),
    );
    const prod = await request(app.getHttpServer()).get('/probe').expect(200);
    expect(prod.headers['strict-transport-security']).toBe(
      'max-age=31536000; includeSubDomains',
    );
    await app.close();

    app = await createApp((a) =>
      a.use(helmet(buildHelmetOptions('development'))),
    );
    const dev = await request(app.getHttpServer()).get('/probe').expect(200);
    expect(dev.headers['strict-transport-security']).toBeUndefined();
  });
});
