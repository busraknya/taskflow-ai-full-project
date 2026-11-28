import { Prisma } from '@prisma/client';
import {
  describeError,
  maskEmail,
  redactSensitiveText,
  stackFramesOnly,
} from './log-sanitizer';

describe('maskEmail', () => {
  it.each([
    ['alice@example.com', 'a***@e***.com'],
    ['bob.smith+tag@mail.company.co.uk', 'b***@m***.uk'],
    ['x@localhost', 'x***@l***'],
  ])('masks %s', (input, expected) => {
    expect(maskEmail(input)).toBe(expected);
  });

  it.each(['', 'not-an-email', '@example.com', 'alice@'])(
    'never echoes malformed input %p',
    (input) => {
      expect(maskEmail(input)).toBe('***');
    },
  );
});

describe('redactSensitiveText', () => {
  it('masks e-mail addresses, e.g. in SMTP replies', () => {
    const text =
      '550 5.1.1 <alice.secret@example.com>: Recipient address rejected';
    const redacted = redactSensitiveText(text);
    expect(redacted).toBe(
      '550 5.1.1 <a***@e***.com>: Recipient address rejected',
    );
    expect(redacted).not.toContain('alice.secret');
  });

  it('removes credentials from connection URLs', () => {
    const redacted = redactSensitiveText(
      'Can not reach postgresql://taskflow:S3cretPass@db.internal:5432/taskflow',
    );
    expect(redacted).toBe(
      'Can not reach postgresql://***@db.internal:5432/taskflow',
    );
  });

  it('removes bearer tokens', () => {
    expect(
      redactSensitiveText('authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def'),
    ).toBe('authorization: Bearer ***');
  });

  it.each([
    ['password=hunter2&user=a', 'password=***&user=a'],
    ['token: abc123', 'token: ***'],
    ['secret="top secret value"', 'secret=***'],
    ['API_KEY=sk-live-123', 'API_KEY=***'],
  ])('removes secret assignments in %p', (input, expected) => {
    expect(redactSensitiveText(input)).toBe(expected);
  });

  it('leaves ordinary diagnostics and package paths intact', () => {
    const text =
      'connect ECONNREFUSED 127.0.0.1:6379\n    at Socket (/app/node_modules/.pnpm/ioredis@5.4.1/node_modules/ioredis/built/Redis.js:10:5)';
    expect(redactSensitiveText(text)).toBe(text);
  });
});

describe('stackFramesOnly', () => {
  it('keeps only stack frames, dropping multi-line messages', () => {
    const stack =
      'Error: first line\nsecond line with alice@example.com\n    at fn (/app/a.js:1:1)\n    at g (/app/b.js:2:2)';
    expect(stackFramesOnly(stack)).toBe(
      '    at fn (/app/a.js:1:1)\n    at g (/app/b.js:2:2)',
    );
  });

  it('returns undefined without frames', () => {
    expect(stackFramesOnly(undefined)).toBeUndefined();
    expect(stackFramesOnly('Error: message only')).toBeUndefined();
  });
});

describe('describeError', () => {
  const prismaMessage =
    'Invalid `prisma.user.create()` invocation:\n\n  data: { email: "alice@example.com", passwordHash: "$2b$10$abcdefghijk" }\n\nUnique constraint failed';

  it('drops the Prisma message and keeps the class, code and frames', () => {
    const error = new Prisma.PrismaClientKnownRequestError(prismaMessage, {
      code: 'P2002',
      clientVersion: 'test',
    });

    const { summary, stack } = describeError(error);

    expect(summary).toBe('PrismaClientKnownRequestError (code=P2002)');
    expect(stack).toMatch(/^\s+at\s/);
    for (const secret of [
      'alice@example.com',
      '$2b$10$',
      'prisma.user.create',
    ]) {
      expect(`${summary}\n${stack}`).not.toContain(secret);
    }
  });

  it('keeps the stack of other errors but redacts sensitive data', () => {
    const error = Object.assign(
      new Error('550 <alice@example.com> rejected; password=hunter2'),
      { code: 'EENVELOPE' },
    );

    const { summary, stack } = describeError(error);

    expect(summary).toBe('Error (code=EENVELOPE)');
    expect(stack).toContain('550 <a***@e***.com> rejected; password=***');
    expect(stack).toMatch(/\n\s+at\s/);
    expect(stack).not.toContain('alice@example.com');
    expect(stack).not.toContain('hunter2');
  });

  it('describes non-Error values by type only', () => {
    expect(describeError('alice@example.com')).toEqual({
      summary: 'non-Error value (string)',
    });
  });
});
