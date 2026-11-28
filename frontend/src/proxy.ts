import { NextResponse, type NextRequest } from "next/server";

/**
 * Nonce-based Content Security Policy (Next.js 16 proxy).
 *
 * A fresh, unpredictable nonce is generated per request and passed to
 * Next.js through the request's CSP header; Next.js attaches it to its own
 * scripts and inline styles during server rendering (pages are rendered
 * dynamically, see app/layout.tsx). No 'unsafe-inline' is allowed for
 * scripts or styles; 'strict-dynamic' lets nonce-trusted scripts load the
 * framework chunks. 'unsafe-eval' is only added in development, where React
 * needs it for debugging.
 *
 * The other security headers are set for all routes in next.config.ts.
 */

function apiOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1";
  try {
    return new URL(configured).origin;
  } catch {
    return "http://localhost:4000";
  }
}

export function buildContentSecurityPolicy(
  nonce: string,
  isDev: boolean,
): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Production: nonce only. Development: the Next.js dev overlay applies
    // inline styles; browsers ignore 'unsafe-inline' when a nonce is present,
    // so dev uses 'unsafe-inline' instead of the nonce for styles only.
    isDev
      ? "style-src 'self' 'unsafe-inline'"
      : `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // The browser talks to the API directly (CORS); nothing else.
    `connect-src 'self' ${apiOrigin()}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // Only safe when the API itself is served over HTTPS; on a plain-HTTP
  // deployment it would upgrade API calls to https:// and break them.
  if (!isDev && apiOrigin().startsWith("https:")) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Documents only: static assets and image optimization need no CSP.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
