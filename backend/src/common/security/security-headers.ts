import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';

/**
 * HTTP security headers for the JSON API (Helmet).
 *
 * The API never serves HTML, scripts or styles, so its Content Security
 * Policy denies every resource type and every framing context. Browsers only
 * evaluate this policy if an API response is rendered as a document (e.g. an
 * injected HTML error page); it does not affect CORS-based XHR/fetch from the
 * frontend. The frontend has its own nonce-based CSP (frontend/src/proxy.ts).
 *
 * HSTS is only sent in production: development runs over plain HTTP and a
 * cached HSTS policy for localhost would break other local services.
 */
export function buildHelmetOptions(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): Parameters<typeof helmet>[0] {
  const isProduction = nodeEnv === 'production';

  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // JSON responses must not be embedded or loaded cross-origin as
    // no-cors subresources; CORS requests from the frontend are unaffected.
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    frameguard: { action: 'deny' },
    hsts: isProduction
      ? { maxAge: 31_536_000, includeSubDomains: true, preload: false }
      : false,
  };
}

export function applySecurityHeaders(app: INestApplication): void {
  app.use(helmet(buildHelmetOptions()));
}
