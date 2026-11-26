import type { CookieOptions, Request, Response } from 'express';
import { REFRESH_TOKEN_TTL_MS } from './refresh-token.util';

export const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * Returns the refresh cookie only if it is a non-empty string. cookie-parser
 * can turn `j:`-prefixed cookies into objects; those are treated as absent.
 */
export function readRefreshCookie(req: Request): string | undefined {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE_NAME];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function baseOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

export function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...baseOptions(),
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, baseOptions());
}
