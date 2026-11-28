import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpException,
  INestApplication,
  Logger,
  NotFoundException,
  Post,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { IsEmail } from 'class-validator';
import request from 'supertest';
import type { App } from 'supertest/types';
import { HttpExceptionFilter } from './http-exception.filter';

const GENERIC = 'An unexpected server error occurred.';

// Internal details that must never reach a client (and, for Prisma, a log).
const DB_ADDRESS = '10.0.0.5:5432';
const SOURCE_PATH = '/app/dist/prisma/prisma.service.js';
const PII_EMAIL = 'alice.secret@example.com';
const PII_HASH = '$2b$10$abcdefghijklmnopqrstuv';
const PRISMA_MESSAGE =
  'Invalid `prisma.user.create()` invocation in /app/dist/auth/auth.service.js:42\n' +
  '\n' +
  `  data: { email: "${PII_EMAIL}", passwordHash: "${PII_HASH}" }\n` +
  '\n' +
  'Unique constraint failed on the fields: (`email`)';

class EmailDto {
  @IsEmail()
  email!: string;
}

function httpError(props: Record<string, unknown>): Error {
  return Object.assign(new Error(String(props.message)), props);
}

@Controller()
class ProbeController {
  @Get('plain')
  plain() {
    throw new Error(`connect ECONNREFUSED ${DB_ADDRESS} at ${SOURCE_PATH}`);
  }

  @Get('type-error')
  typeError(): unknown {
    const value = undefined as unknown as { secretField: string };
    return value.secretField;
  }

  @Get('prisma-known')
  prismaKnown() {
    throw new Prisma.PrismaClientKnownRequestError(PRISMA_MESSAGE, {
      code: 'P2002',
      clientVersion: 'test',
    });
  }

  @Get('prisma-validation')
  prismaValidation() {
    throw new Prisma.PrismaClientValidationError(PRISMA_MESSAGE, {
      clientVersion: 'test',
    });
  }

  @Get('non-error')
  nonError() {
    throw `raw ${PII_EMAIL}`; // eslint-disable-line @typescript-eslint/only-throw-error
  }

  @Get('not-found')
  notFound() {
    throw new NotFoundException('Workspace not found.');
  }

  @Get('conflict')
  conflict() {
    throw new ConflictException({
      code: 'STALE_VERSION',
      message: 'The task was modified by someone else.',
      details: { version: 3 },
    });
  }

  @Get('unavailable')
  unavailable() {
    throw new ServiceUnavailableException(
      'Authentication is temporarily unavailable. Please try again shortly.',
    );
  }

  @Get('http-500')
  http500() {
    throw new HttpException('Intentional developer message', 500);
  }

  @Get('exposed-4xx')
  exposed4xx() {
    throw httpError({
      status: 415,
      expose: true,
      message: 'unsupported charset "X"',
    });
  }

  @Get('hidden-4xx')
  hidden4xx() {
    throw httpError({
      status: 400,
      expose: false,
      message: `hidden ${SOURCE_PATH}`,
    });
  }

  @Get('exposed-5xx')
  exposed5xx() {
    throw httpError({
      status: 502,
      expose: true,
      message: `upstream ${DB_ADDRESS}`,
    });
  }

  @Post('validate')
  validate(@Body() body: EmailDto) {
    return { ok: true, email: body.email };
  }
}

describe('HttpExceptionFilter', () => {
  let app: INestApplication<App>;
  let errorLog: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProbeController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const http = () => request(app.getHttpServer());

  /** Everything the filter wrote to the error log, as one string. */
  const loggedText = () =>
    errorLog.mock.calls
      .flat()
      .map((part) => String(part))
      .join('\n');

  describe('unexpected errors', () => {
    it.each([
      ['a plain Error', '/plain', [DB_ADDRESS, SOURCE_PATH, 'ECONNREFUSED']],
      ['a TypeError', '/type-error', ['secretField', 'Cannot read']],
      [
        'a Prisma known request error',
        '/prisma-known',
        [PII_EMAIL, PII_HASH, 'prisma.user.create'],
      ],
      [
        'a Prisma validation error',
        '/prisma-validation',
        [PII_EMAIL, PII_HASH, 'prisma.user.create'],
      ],
      ['a non-Error value', '/non-error', [PII_EMAIL]],
    ])(
      'returns only the generic 500 response for %s',
      async (_label, path, secrets) => {
        const res = await http().get(path).expect(500);

        expect(res.body).toEqual({
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          message: GENERIC,
          details: {},
        });
        const body = JSON.stringify(res.body);
        for (const secret of secrets) {
          expect(body).not.toContain(secret);
        }
        expect(body).not.toMatch(/\bat\s.+:\d+:\d+/); // no stack frames
      },
    );

    it('logs a non-Prisma error with method, path and stack', async () => {
      await http().get('/plain').expect(500);

      expect(errorLog).toHaveBeenCalledTimes(1);
      const [summary, stack] = errorLog.mock.calls[0] as [string, string];
      expect(summary).toBe('Unhandled Error on GET /plain');
      expect(stack).toContain(DB_ADDRESS);
      expect(stack).toMatch(/\n\s+at\s/);
    });

    it('never logs the query string', async () => {
      await http().get('/plain?token=query-secret-123').expect(500);

      expect(loggedText()).toContain('GET /plain');
      expect(loggedText()).not.toContain('query-secret-123');
      expect(loggedText()).not.toContain('?');
    });

    it.each([
      ['/prisma-known', 'PrismaClientKnownRequestError', ' (code=P2002)'],
      ['/prisma-validation', 'PrismaClientValidationError', ''],
    ])(
      'logs %s without the Prisma message or query data',
      async (path, className, codeSuffix) => {
        await http().get(path).expect(500);

        expect(errorLog).toHaveBeenCalledTimes(1);
        const [summary, frames] = errorLog.mock.calls[0] as [string, string];
        expect(summary).toBe(
          `Unhandled ${className}${codeSuffix} on GET ${path}`,
        );
        expect(frames).toMatch(/^\s+at\s/);
        for (const line of frames.split('\n')) {
          expect(line).toMatch(/^\s+at\s/);
        }

        const logged = loggedText();
        for (const secret of [
          PII_EMAIL,
          PII_HASH,
          'prisma.user.create',
          'Unique constraint failed',
          '/app/dist/auth/auth.service.js',
        ]) {
          expect(logged).not.toContain(secret);
        }
      },
    );

    it('logs a non-Error value by type only', async () => {
      await http().get('/non-error').expect(500);

      expect(loggedText()).toBe(
        'Unhandled non-Error value (string) on GET /non-error',
      );
    });
  });

  describe('exposed http-errors (A1)', () => {
    it('returns 413 with the safe message for an oversized JSON body', async () => {
      const res = await http()
        .post('/validate')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ email: 'a'.repeat(200_000) }))
        .expect(413);

      expect(res.body).toEqual({
        statusCode: 413,
        code: 'Payload Too Large',
        message: 'request entity too large',
        details: {},
      });
      expect(errorLog).not.toHaveBeenCalled();
    });

    it('keeps the status and message of other exposed 4xx errors', async () => {
      const res = await http().get('/exposed-4xx').expect(415);
      expect(res.body).toEqual({
        statusCode: 415,
        code: 'Unsupported Media Type',
        message: 'unsupported charset "X"',
        details: {},
      });
    });

    it.each([
      ['a 4xx error that is not exposed', '/hidden-4xx', SOURCE_PATH],
      ['an exposed error outside the 4xx range', '/exposed-5xx', DB_ADDRESS],
    ])('treats %s as unexpected', async (_label, path, secret) => {
      const res = await http().get(path).expect(500);
      expect(res.body).toMatchObject({ message: GENERIC });
      expect(JSON.stringify(res.body)).not.toContain(secret);
      expect(errorLog).toHaveBeenCalledTimes(1);
    });
  });

  describe('existing HttpException behaviour (B1)', () => {
    it('keeps business error messages', async () => {
      const res = await http().get('/not-found').expect(404);
      expect(res.body).toEqual({
        statusCode: 404,
        code: 'Not Found',
        message: 'Workspace not found.',
        details: {},
      });
    });

    it('keeps custom codes and details', async () => {
      const res = await http().get('/conflict').expect(409);
      expect(res.body).toEqual({
        statusCode: 409,
        code: 'STALE_VERSION',
        message: 'The task was modified by someone else.',
        details: { version: 3 },
      });
    });

    it('keeps the intentional 503 rate-limiter message', async () => {
      const res = await http().get('/unavailable').expect(503);
      expect(res.body).toMatchObject({
        code: 'Service Unavailable',
        message:
          'Authentication is temporarily unavailable. Please try again shortly.',
      });
    });

    it('keeps intentionally supplied 5xx HttpException messages', async () => {
      const res = await http().get('/http-500').expect(500);
      expect(res.body).toMatchObject({
        message: 'Intentional developer message',
      });
    });

    it('keeps ValidationPipe field details', async () => {
      const res = await http()
        .post('/validate')
        .send({ email: 'not-an-email', extra: true })
        .expect(400);
      expect(res.body).toEqual({
        statusCode: 400,
        code: 'Bad Request',
        message: 'Validation failed.',
        details: {
          fields: expect.arrayContaining([
            'property extra should not exist',
            'email must be an email',
          ]) as unknown,
        },
      });
    });

    it('keeps malformed JSON as a 400 error', async () => {
      const res = await http()
        .post('/validate')
        .set('Content-Type', 'application/json')
        .send('{"email": ')
        .expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('does not log expected HttpExceptions', async () => {
      await http().get('/not-found').expect(404);
      await http().get('/conflict').expect(409);
      expect(errorLog).not.toHaveBeenCalled();
    });
  });
});
