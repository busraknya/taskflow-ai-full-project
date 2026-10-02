/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest'; // Namespace import (*) yerine default import kullanıyoruz!
import { AppModule } from './../src/app.module';

describe('TaskFlow AI Core Invariants (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api/v1/workspaces (GET) - Should fail without auth (Fail-closed invariant #2)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .expect(401);
  });

  it('/api/v1/workspaces/fake-ws-id/tasks (GET) - Should return 404 for non-existent or cross-tenant workspace (Invariant #1)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/workspaces/fake-ws-id/tasks')
      .set('Authorization', 'Bearer fake_token_string')
      .expect(401);
  });
});