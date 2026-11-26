/// <reference types="jest" />
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('TaskFlow AI Core Invariants (E2E)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires authentication for workspace access', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/workspaces/fake-ws-id/tasks')
      .set('Authorization', 'Bearer fake_token_string')
      .expect(401);
  });

  it('registers and authenticates users, rotates mobile refresh tokens, and isolates workspace data', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
    const password = 'Taskflow123';
    const ownerEmail = `owner-${suffix}@example.com`;
    const outsiderEmail = `outsider-${suffix}@example.com`;

    // Registration validates DTOs and never returns password material.
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: ownerEmail, password, fullName: 'Workspace Owner' })
      .expect(201);

    expect(registration.body.user.email).toBe(ownerEmail);
    expect(registration.body.user.passwordHash).toBeUndefined();

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: ownerEmail, password, fullName: 'Duplicate Owner' })
      .expect(409);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `invalid-${suffix}@example.com`,
        password,
        fullName: 'Invalid User',
        role: 'OWNER',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/auth/mobile/login')
      .send({ email: ownerEmail, password: 'wrong-password' })
      .expect(401);

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/mobile/login')
      .send({ email: ownerEmail, password })
      .expect(200);

    const ownerAccessToken = login.body.accessToken as string;
    const initialRefreshToken = login.body.refreshToken as string;
    expect(ownerAccessToken).toBeTruthy();
    expect(initialRefreshToken).toBeTruthy();
    expect(login.body.user.email).toBe(ownerEmail);

    // Refresh rotation accepts the current token and rejects reuse of the old one.
    const refresh = await request(app.getHttpServer())
      .post('/api/v1/auth/mobile/refresh')
      .send({ refreshToken: initialRefreshToken })
      .expect(200);

    const rotatedRefreshToken = refresh.body.refreshToken as string;
    expect(refresh.body.accessToken).toBeTruthy();
    expect(rotatedRefreshToken).toBeTruthy();
    expect(rotatedRefreshToken).not.toBe(initialRefreshToken);

    await request(app.getHttpServer())
      .post('/api/v1/auth/mobile/refresh')
      .send({ refreshToken: initialRefreshToken })
      .expect(401);

    // A fresh login establishes a session after the intentional reuse detection.
    const ownerLoginAgain = await request(app.getHttpServer())
      .post('/api/v1/auth/mobile/login')
      .send({ email: ownerEmail, password })
      .expect(200);
    const ownerToken = ownerLoginAgain.body.accessToken as string;
    const ownerRefreshToken = ownerLoginAgain.body.refreshToken as string;

    const workspace = await request(app.getHttpServer())
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Integration Workspace', slug: `integration-${suffix}` })
      .expect(201);

    expect(workspace.body.id).toBeTruthy();
    const workspaceId = workspace.body.id as string;

    const project = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Integration Project', description: 'E2E project' })
      .expect(201);

    expect(project.body.id).toBeTruthy();
    const projectId = project.body.id as string;

    const task = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/tasks`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Verify tenant boundary', projectId, priority: 2 })
      .expect(201);

    expect(task.body.id).toBeTruthy();

    // A different authenticated user must not see or mutate this workspace.
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: outsiderEmail, password, fullName: 'Outsider User' })
      .expect(201);

    const outsiderLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/mobile/login')
      .send({ email: outsiderEmail, password })
      .expect(200);
    const outsiderToken = outsiderLogin.body.accessToken as string;

    const outsiderWorkspaces = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(200);

    expect(outsiderWorkspaces.body).toEqual([]);

    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/api/v1/workspaces/${workspaceId}/tasks/${task.body.id}`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ title: 'Unauthorized change' })
      .expect(404);

    // Logout revokes the current mobile refresh token.
    await request(app.getHttpServer())
      .post('/api/v1/auth/mobile/logout')
      .send({ refreshToken: ownerRefreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/auth/mobile/refresh')
      .send({ refreshToken: ownerRefreshToken })
      .expect(401);
  });
});
