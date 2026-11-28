import { createHash, randomBytes } from 'crypto';

/** Refresh token lifetime. Also used for the cookie maxAge. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * A rotated token presented again within this window is treated as a benign
 * concurrent request (e.g. two tabs refreshing at once) instead of reuse.
 */
export const REFRESH_REUSE_GRACE_MS = 30_000;

/** Opaque, high-entropy refresh token (32 random bytes, base64url). */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex digest; the only form of the refresh token that is persisted. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
