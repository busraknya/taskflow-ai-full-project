/** Error body returned by the API for every failed request. */
export interface ApiErrorBody {
  code?: string;
  message?: string;
  details?: { fields?: string[] };
}

const CODE_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'The email or password you entered is incorrect.',
  EMAIL_ALREADY_EXISTS: 'This email address is already registered.',
  STALE_VERSION: 'This task was modified by another user. Please refresh.',
  LAST_OWNER_PROTECTION: 'Cannot remove the last owner of the workspace.',
};

/**
 * A friendly text for known codes; otherwise the API's own message (or the
 * first validation error). Codes such as NOT_FOUND are never shown as text.
 */
export const getErrorMessage = (body?: ApiErrorBody): string =>
  (body?.code && CODE_MESSAGES[body.code]) ||
  body?.details?.fields?.[0] ||
  body?.message ||
  'An unexpected error occurred. Please try again.';
