import { ConfigService } from '@nestjs/config';
import type { JwtModuleOptions } from '@nestjs/jwt';

/** Name and value of the claim that marks a JWT as an access token. */
export const TOKEN_TYPE_CLAIM = 'tokenType';
export const ACCESS_TOKEN_TYPE = 'access';
export const ACCESS_TOKEN_TTL = '15m';

/** HS256 secrets shorter than this are rejected at startup. */
export const MIN_JWT_SECRET_BYTES = 32;

/**
 * Sample values that have been published in this repository's .env.example
 * files (current and historical). Anyone can read them, so they must never
 * sign tokens. Compared case-insensitively.
 */
export const KNOWN_PLACEHOLDER_JWT_SECRETS: readonly string[] = [
  'replace_with_at_least_32_random_bytes',
  'change_me_to_a_very_secure_random_string_min_32_chars',
];

/**
 * Template markers that indicate an unedited sample value. Generated secrets
 * cannot contain them: hex output is limited to [0-9a-f], and the chance of an
 * 8+ character marker appearing in a random base64 string is negligible.
 * Compared case-insensitively.
 */
export const PLACEHOLDER_JWT_SECRET_MARKERS: readonly string[] = [
  'replace_with',
  'replace-with',
  'replaceme',
  'replace_me',
  'change_me',
  'change-me',
  'changeme',
  'change_this',
  'change-this',
  'your_secret',
  'your-secret',
  'yoursecret',
  'placeholder',
];

/**
 * A value that is entirely a bracketed template such as
 * "<generate-a-random-secret>". Only the full value is matched: random
 * secrets that merely contain "<" or ">" (e.g. password-manager output with
 * symbols) are not rejected.
 */
export const BRACKETED_TEMPLATE_JWT_SECRET = /^<[\w .:-]+>$/i;

/**
 * A value made only of repetitions of a unit up to this length
 * ("aaaa...", "abab...", "12345678" repeated) is rejected regardless of
 * its length. This is a structural check, not an entropy estimate.
 */
export const MAX_REPEATED_UNIT_LENGTH = 8;

const TOO_SHORT_MESSAGE =
  'FATAL: JWT_SECRET must contain at least 32 bytes of high-entropy secret material.';

const PLACEHOLDER_MESSAGE =
  'FATAL: JWT_SECRET is a known placeholder or a trivially weak value. ' +
  'Generate a random secret (for example with: openssl rand -hex 32).';

function isRepeatedShortUnit(value: string): boolean {
  const chars = Array.from(value);
  const maxUnit = Math.min(MAX_REPEATED_UNIT_LENGTH, chars.length - 1);
  for (let unit = 1; unit <= maxUnit; unit++) {
    if (chars.every((char, index) => char === chars[index % unit])) {
      return true;
    }
  }
  return false;
}

function isPlaceholderOrTriviallyWeak(secret: string): boolean {
  const normalized = secret.toLowerCase();
  return (
    KNOWN_PLACEHOLDER_JWT_SECRETS.includes(normalized) ||
    PLACEHOLDER_JWT_SECRET_MARKERS.some((marker) =>
      normalized.includes(marker),
    ) ||
    BRACKETED_TEMPLATE_JWT_SECRET.test(secret) ||
    isRepeatedShortUnit(secret)
  );
}

/**
 * Returns JWT_SECRET or throws. Called while Nest builds the DI container
 * (JwtModule factory and JwtStrategy), i.e. before the HTTP server listens,
 * so an invalid secret prevents the application from starting.
 *
 * Error messages never include the secret or details derived from it.
 */
export function getRequiredJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET');
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_JWT_SECRET_BYTES) {
    throw new Error(TOO_SHORT_MESSAGE);
  }
  if (isPlaceholderOrTriviallyWeak(secret)) {
    throw new Error(PLACEHOLDER_MESSAGE);
  }
  return secret;
}

/** Options for JwtModule.registerAsync; the secret is validated above. */
export function buildJwtModuleOptions(
  configService: ConfigService,
): JwtModuleOptions {
  return {
    secret: getRequiredJwtSecret(configService),
    signOptions: { expiresIn: ACCESS_TOKEN_TTL },
  };
}
