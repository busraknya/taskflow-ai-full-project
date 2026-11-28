/**
 * Invitation links carry a single-use token in the URL fragment
 * (/invite#<token>), which browsers never send to a server. While the
 * recipient signs in or registers, the token is kept in sessionStorage
 * (this tab only) and removed after use.
 */
const STORAGE_KEY = 'taskflow.pendingInvitation';

export function savePendingInvitation(token: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Storage unavailable (private mode): the link can be opened again.
  }
}

export function pendingInvitation(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvitation(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Accepts only same-site paths ("/x"), never "//host" or "/\\host", so a
 * crafted ?next= cannot redirect users to another site.
 */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return null;
  }
  return value;
}

/** Where to go after signing in. */
export function postLoginPath(search: string): string {
  const next = safeNextPath(new URLSearchParams(search).get('next'));
  if (next) return next;
  return pendingInvitation() ? '/invite' : '/workspaces';
}

export const INVITATION_ERRORS: Record<string, string> = {
  INVITATION_NOT_FOUND: 'This invitation link is not valid. Ask for a new invitation.',
  INVITATION_USED: 'This invitation has already been used or was revoked.',
  INVITATION_EXPIRED: 'This invitation has expired. Ask the person who invited you for a new one.',
  ALREADY_MEMBER: 'You are already a member of this workspace.',
};
