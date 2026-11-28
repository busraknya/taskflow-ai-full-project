import { Prisma } from '@prisma/client';

/**
 * Helpers for writing logs without personal data or secrets. Logs are kept on
 * the server, but they are often shipped to third-party services and read by
 * operators, so they must not contain e-mail addresses, credentials or tokens.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;
const BEARER_TOKEN = /\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi;
const SECRET_ASSIGNMENT =
  /\b(password|passwd|pwd|secret|token|api[_-]?key)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s&,;]+)/gi;

/** `alice@example.com` -> `a***@e***.com`. Never returns the full address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) {
    return '***';
  }
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const maskedDomain =
    dot > 0 ? `${domain[0]}***${domain.slice(dot)}` : `${domain[0]}***`;
  return `${local[0]}***@${maskedDomain}`;
}

/**
 * Removes secrets and masks e-mail addresses in free text such as error
 * messages and stack traces (SMTP replies echo recipients, connection errors
 * can contain URLs with credentials).
 */
export function redactSensitiveText(text: string): string {
  return text
    .replace(URL_CREDENTIALS, '$1***@')
    .replace(BEARER_TOKEN, '$1 ***')
    .replace(SECRET_ASSIGNMENT, '$1$2***')
    .replace(EMAIL, (match) => maskEmail(match));
}

type PrismaClientError =
  | Prisma.PrismaClientKnownRequestError
  | Prisma.PrismaClientUnknownRequestError
  | Prisma.PrismaClientRustPanicError
  | Prisma.PrismaClientInitializationError
  | Prisma.PrismaClientValidationError;

export function isPrismaError(
  exception: unknown,
): exception is PrismaClientError {
  return (
    exception instanceof Prisma.PrismaClientKnownRequestError ||
    exception instanceof Prisma.PrismaClientUnknownRequestError ||
    exception instanceof Prisma.PrismaClientRustPanicError ||
    exception instanceof Prisma.PrismaClientInitializationError ||
    exception instanceof Prisma.PrismaClientValidationError
  );
}

/**
 * Only the "    at ..." frames of a stack. Prisma messages can span several
 * lines and include query arguments, so every message line is dropped.
 */
export function stackFramesOnly(stack: string | undefined): string | undefined {
  if (!stack) {
    return undefined;
  }
  const frames = stack
    .split('\n')
    .filter((line) => /^\s+at\s/.test(line))
    .join('\n');
  return frames || undefined;
}

/**
 * Safe log representation of a caught error: the error class and code for the
 * log line, and a stack trace that contains no personal data or secrets.
 * Prisma messages are dropped entirely; other messages are redacted.
 */
export function describeError(error: unknown): {
  summary: string;
  stack?: string;
} {
  if (!(error instanceof Error)) {
    return { summary: `non-Error value (${typeof error})` };
  }
  const code =
    'code' in error && typeof error.code === 'string' ? error.code : undefined;
  const summary = code
    ? `${error.constructor.name} (code=${code})`
    : error.constructor.name;

  if (isPrismaError(error)) {
    return { summary, stack: stackFramesOnly(error.stack) };
  }
  return {
    summary,
    stack: error.stack ? redactSensitiveText(error.stack) : undefined,
  };
}
