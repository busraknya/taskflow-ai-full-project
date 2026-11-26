import { ConfigService } from '@nestjs/config';

/** Name and value of the claim that marks a JWT as an access token. */
export const TOKEN_TYPE_CLAIM = 'tokenType';
export const ACCESS_TOKEN_TYPE = 'access';
export const ACCESS_TOKEN_TTL = '15m';

/** HS256 secrets shorter than this are rejected at startup. */
export const MIN_JWT_SECRET_BYTES = 32;

export function getRequiredJwtSecret(configService: ConfigService): string {
  const secret = configService.get<string>('JWT_SECRET');
  if (!secret || Buffer.byteLength(secret, 'utf8') < MIN_JWT_SECRET_BYTES) {
    throw new Error(
      'FATAL: JWT_SECRET must contain at least 32 bytes of high-entropy secret material.',
    );
  }
  return secret;
}
