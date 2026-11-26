import { SetMetadata } from '@nestjs/common';

export interface RatePolicy {
  limit: number;
  windowSeconds: number;
}

/**
 * Central rate-limit policy table. All counters live in Redis (fixed window,
 * atomic INCR+EXPIRE), so limits are shared consistently across instances.
 *
 * Failure policy when Redis is unavailable:
 * - Credential / abuse-sensitive policies (auth endpoints, login per
 *   account, password change, invitations) FAIL CLOSED with 503: a missing
 *   limiter must not re-open brute force or email abuse.
 * - Baseline traffic policies (per-IP, per-user read/write) FAIL OPEN with a
 *   throttled error log: authentication and authorization still apply, and a
 *   Redis outage should not take the whole API down.
 */
export const RATE_LIMITS = {
  /** Per client IP, every request except health checks. Fails open. */
  ipBaseline: { limit: 600, windowSeconds: 60 },
  /** Per authenticated user, GET/HEAD/OPTIONS. Fails open. */
  userRead: { limit: 300, windowSeconds: 60 },
  /** Per authenticated user, mutating requests. Fails open. */
  userWrite: { limit: 120, windowSeconds: 60 },
  /** Per account (normalized email), web + mobile login. Fails closed. */
  loginAccount: { limit: 20, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RatePolicy>;

/** Per-user policies for sensitive operations. All fail closed. */
export const SENSITIVE_RATE_LIMITS = {
  /** Brute force of the current password with a stolen access token. */
  'password-change': { limit: 5, windowSeconds: 15 * 60 },
  /** Invitation email abuse; complements the per-IP auth limit. */
  'workspace-invite': { limit: 30, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RatePolicy>;

export type SensitiveRatePolicyName = keyof typeof SENSITIVE_RATE_LIMITS;

export const SENSITIVE_RATE_POLICY_KEY = 'rateLimit:sensitivePolicy';
export const SKIP_RATE_LIMIT_KEY = 'rateLimit:skip';

/** Applies an additional strict, fail-closed per-user limit to a route. */
export const SensitiveRateLimit = (policy: SensitiveRatePolicyName) =>
  SetMetadata(SENSITIVE_RATE_POLICY_KEY, policy);

/** Excludes a route from baseline limits (health checks only). */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);
