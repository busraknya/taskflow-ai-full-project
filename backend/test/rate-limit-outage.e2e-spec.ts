/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AuthModule } from '../src/auth/auth.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { RateLimitModule } from '../src/common/rate-limit/rate-limit.module';
import { RateLimitService } from '../src/common/rate-limit/rate-limit.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersModule } from '../src/users/users.module';

/**
 * SEC-02 failure policy with the rate limiter's Redis unreachable (a closed
 * local port) and a real, migrated, disposable PostgreSQL (DATABASE_URL):
 * - credential and sensitive endpoints fail closed (503);
 * - ordinary authenticated traffic fails open (served, outage logged).
 */
const describeWithDb =
  process.env.DATABASE_URL && process.env.JWT_SECRET ? describe : describe.skip;

describeWithDb('Rate limiter outage policy (SEC-02)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;
  let limiter: RateLimitService;
  const email = `sec02-outage-${randomUUID()}@example.test`;
  let userId: string;

  beforeAll(async () => {
    // Build the limiter against a port nothing listens on.
    const saved = {
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    };
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '9';
    limiter = new RateLimitService();
    process.env.REDIS_HOST = saved.host;
    process.env.REDIS_PORT = saved.port;

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        RateLimitModule,
        AuthModule,
        UsersModule,
      ],
    })
      .overrideProvider(RateLimitService)
      .useValue(limiter)
      .compile();

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
    jwt = moduleRef.get(JwtService);

    const user = await prisma.user.create({
      data: {
        email,
        fullName: 'SEC-02 outage',
        passwordHash: await bcrypt.hash('Password123', 4),
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma?.user.deleteMany({ where: { email } });
    limiter?.onModuleDestroy();
    await app?.close();
  });

  // Login is unavailable while Redis is down, so mint an access token the
  // same way the service does.
  const accessToken = () =>
    jwt.sign({ sub: userId, email, tokenType: 'access' }, { expiresIn: '5m' });

  it('authentication endpoints fail closed (503)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'Password123' })
      .expect(503);
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|redis/i);
  });

  it('sensitive per-user operations fail closed (503)', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/password')
      .set('Authorization', `Bearer ${accessToken()}`)
      .send({ currentPassword: 'Password123', newPassword: 'NewPassword456' })
      .expect(503);

    // The password was not changed.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(await bcrypt.compare('Password123', user!.passwordHash)).toBe(true);
  });

  it('ordinary authenticated requests fail open', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/users/me/notification-preferences')
      .set('Authorization', `Bearer ${accessToken()}`)
      .expect(200);
  });
});
