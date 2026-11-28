import { randomBytes } from 'crypto';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { PrismaService } from '../prisma/prisma.service';
import {
  ACCESS_TOKEN_TTL,
  buildJwtModuleOptions,
  getRequiredJwtSecret,
  MIN_JWT_SECRET_BYTES,
} from './jwt-config';
import { JwtStrategy } from './strategies/jwt.strategy';

const TOO_SHORT = 'JWT_SECRET must contain at least 32 bytes';
const PLACEHOLDER =
  'JWT_SECRET is a known placeholder or a trivially weak value';

/** Value currently shipped in .env.example (copied, not read from disk). */
const ENV_EXAMPLE_PLACEHOLDER = 'replace_with_at_least_32_random_bytes';

function configWith(secret: string | undefined): ConfigService {
  return {
    get: (key: string) => (key === 'JWT_SECRET' ? secret : undefined),
  } as unknown as ConfigService;
}

function validate(secret: string | undefined): string {
  return getRequiredJwtSecret(configWith(secret));
}

const bytes = (value: string) => Buffer.byteLength(value, 'utf8');

describe('getRequiredJwtSecret', () => {
  describe('rejects known placeholders and trivially weak values', () => {
    it('rejects the current .env.example placeholder', () => {
      expect(bytes(ENV_EXAMPLE_PLACEHOLDER)).toBeGreaterThanOrEqual(
        MIN_JWT_SECRET_BYTES,
      );
      expect(() => validate(ENV_EXAMPLE_PLACEHOLDER)).toThrow(PLACEHOLDER);
    });

    it.each([
      [
        'the historical .env.example placeholder',
        'change_me_to_a_very_secure_random_string_min_32_chars',
      ],
      ['an upper-case placeholder', 'REPLACE_WITH_AT_LEAST_32_RANDOM_BYTES'],
      ['a change-me template', 'CHANGE-ME-before-deploying-to-production-now'],
      ['a changeme template', 'changeme-changeme-please-set-a-real-key'],
      ['a your-secret template', 'your-secret-key-goes-here-at-least-32-b'],
      ['a your_secret template', 'your_secret_jwt_signing_key_for_taskflow'],
      ['a placeholder template', 'jwt-placeholder-value-for-local-testing'],
      ['an angle-bracket template', '<generate-a-random-32-byte-secret-here>'],
      [
        'an upper-case angle-bracket template',
        '<GENERATE_A_SECRET_WITH_OPENSSL_RAND_HEX>',
      ],
      ['a replace-with template', 'replace-with-a-long-random-jwt-key-value'],
      ['a replaceme template', 'jwt-signing-key-replaceme-before-deploy'],
      ['a replace_me template', 'replace_me_with_a_real_jwt_signing_key'],
      ['a change_this template', 'change_this_jwt_signing_key_in_production'],
      ['a change-this template', 'change-this-jwt-signing-key-in-production'],
      ['a yoursecret template', 'yoursecretjwtsigningkeyforthetaskflowapp'],
      ['a single repeated character', 'a'.repeat(32)],
      ['repeated zeros', '0'.repeat(64)],
      ['only spaces', ' '.repeat(32)],
      ['a repeated two-character unit', 'ab'.repeat(16)],
      ['a repeated eight-character unit', '12345678'.repeat(4)],
      ['a repeated short word', 'secret'.repeat(6)],
    ])('rejects %s', (_label, value) => {
      expect(bytes(value)).toBeGreaterThanOrEqual(MIN_JWT_SECRET_BYTES);
      expect(() => validate(value)).toThrow(PLACEHOLDER);
    });

    it('never includes the rejected secret in the error message', () => {
      for (const value of [ENV_EXAMPLE_PLACEHOLDER, 'a'.repeat(32), 'short']) {
        let message = '';
        try {
          validate(value);
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).toMatch(/^FATAL: JWT_SECRET/);
        expect(message).not.toContain(value);
      }
    });
  });

  describe('accepts properly generated and existing CI/test secrets', () => {
    it.each([
      [
        'a random hex secret (openssl rand -hex 32)',
        randomBytes(32).toString('hex'),
      ],
      ['a random base64url secret', randomBytes(48).toString('base64url')],
      ['the CI workflow secret', 'ci-only-secret-value-at-least-32-characters'],
      ['the unit-test secret', 'test-only-jwt-secret-at-least-32-bytes-long'],
    ])('accepts %s', (_label, value) => {
      expect(validate(value)).toBe(value);
    });

    // Regression: "<" and ">" used to be substring markers, which rejected
    // about half of random printable-ASCII secrets (password-manager style).
    it.each([
      ['"<" in the middle', 'q7<Zr!9m#Lp2$Wx&4Kd*Vb8^Nf6@Hs3%'],
      ['">" in the middle', 'G>5t~Yk!2wQ;8eR(3uP)7iO_9pA+1sD='],
      ['"<" at the start', '<4fT!9xQ#2mL7$wR8&kP3*zN6^bV1%cH'],
      ['">" at the end', 'pW3@rT8!nY6#qL1$zK4%mX9^bV2&cJ7>'],
      [
        '"<" at the start and ">" at the end with symbols inside',
        '<Jh7&kL9#mN2@bV5!cX8$zQ4*wE6^rT1>',
      ],
      ['repeated angle brackets', '>>q8Zm!3Lp<<7Wx#2Kd&9Vb^4Nf@6Hs%'],
    ])('accepts a strong symbol secret with %s', (_label, value) => {
      expect(bytes(value)).toBeGreaterThanOrEqual(MIN_JWT_SECRET_BYTES);
      expect(validate(value)).toBe(value);
    });

    it('does not reject a value whose repeating unit is longer than 8 characters', () => {
      const value = '123456789'.repeat(4);
      expect(validate(value)).toBe(value);
    });
  });

  describe('minimum length boundary', () => {
    it('rejects a missing secret', () => {
      expect(() => validate(undefined)).toThrow(TOO_SHORT);
      expect(() => validate('')).toThrow(TOO_SHORT);
    });

    it('rejects 31 bytes and accepts 32 bytes of random material', () => {
      const random = randomBytes(16).toString('hex');
      expect(bytes(random)).toBe(32);
      expect(() => validate(random.slice(0, 31))).toThrow(TOO_SHORT);
      expect(validate(random)).toBe(random);
    });

    it('counts UTF-8 bytes rather than characters', () => {
      const twoByteChars = 'àáâãäåæçèéêëìíîï';
      expect(bytes(twoByteChars)).toBe(32);
      expect(validate(twoByteChars)).toBe(twoByteChars);

      const thirtyOneBytes = twoByteChars.slice(0, 15) + 'x';
      expect(bytes(thirtyOneBytes)).toBe(31);
      expect(() => validate(thirtyOneBytes)).toThrow(TOO_SHORT);
    });

    it('applies the placeholder checks to values that pass the length check', () => {
      const repeated = 'z'.repeat(MIN_JWT_SECRET_BYTES);
      expect(() => validate(repeated)).toThrow(PLACEHOLDER);
      expect(() => validate(repeated.slice(1))).toThrow(TOO_SHORT);
    });
  });
});

describe('JWT configuration at application startup', () => {
  async function compileJwtModule(secret: string) {
    @Module({
      providers: [{ provide: ConfigService, useValue: configWith(secret) }],
      exports: [ConfigService],
    })
    class StubConfigModule {}

    return Test.createTestingModule({
      imports: [
        JwtModule.registerAsync({
          imports: [StubConfigModule],
          inject: [ConfigService],
          useFactory: buildJwtModuleOptions,
        }),
      ],
    }).compile();
  }

  it('fails module initialisation with the .env.example placeholder', async () => {
    await expect(compileJwtModule(ENV_EXAMPLE_PLACEHOLDER)).rejects.toThrow(
      PLACEHOLDER,
    );
  });

  it('fails module initialisation with a too-short secret', async () => {
    await expect(compileJwtModule('too-short')).rejects.toThrow(TOO_SHORT);
  });

  it('initialises and signs tokens with a valid random secret', async () => {
    const moduleRef = await compileJwtModule(randomBytes(32).toString('hex'));
    const token = moduleRef.get(JwtService).sign({ sub: 'user-1' });
    const payload = moduleRef.get(JwtService).decode<{
      iat: number;
      exp: number;
    }>(token);
    // Token lifetime is unchanged by the stricter validation.
    expect(ACCESS_TOKEN_TTL).toBe('15m');
    expect(payload.exp - payload.iat).toBe(15 * 60);
    await moduleRef.close();
  });

  it('refuses to construct JwtStrategy with a placeholder secret', () => {
    expect(
      () =>
        new JwtStrategy(
          {} as PrismaService,
          configWith(ENV_EXAMPLE_PLACEHOLDER),
        ),
    ).toThrow(PLACEHOLDER);
  });
});
