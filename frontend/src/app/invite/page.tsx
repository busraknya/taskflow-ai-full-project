'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { Alert } from '@/components/ui/Alert';
import {
  clearPendingInvitation,
  INVITATION_ERRORS,
  pendingInvitation,
  savePendingInvitation,
} from '@/lib/invitations';

interface InvitationPreview {
  status: 'pending' | 'expired' | 'accepted' | 'revoked';
  email: string;
  role: string;
  workspaceName: string;
  inviterName: string | null;
  expiresAt: string;
}

type ErrorBody = { response?: { status?: number; data?: { code?: string; message?: string } } };

const STATUS_TEXT: Record<Exclude<InvitationPreview['status'], 'pending'>, string> = {
  expired: INVITATION_ERRORS.INVITATION_EXPIRED,
  accepted: 'This invitation has already been accepted.',
  revoked: 'This invitation was revoked.',
};

export default function InvitePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fromHash = window.location.hash.slice(1);
    if (fromHash) {
      savePendingInvitation(fromHash);
      // Keep the token out of the address bar and browser history.
      window.history.replaceState(null, '', '/invite');
    }
    const current = fromHash || pendingInvitation();
    Promise.resolve()
      .then(async () => {
        if (!current) {
          throw { response: { data: { code: 'INVITATION_NOT_FOUND' } } };
        }
        const res = await api.post<InvitationPreview>('/invitations/preview', { token: current });
        if (cancelled) return;
        setToken(current);
        setInvitation(res.data);
      })
      .catch((err: ErrorBody) => {
        if (cancelled) return;
        const code = err.response?.data?.code ?? '';
        setError(INVITATION_ERRORS[code] ?? 'The invitation could not be loaded. Try again later.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const accept = async () => {
    if (!token) return;
    setAccepting(true);
    setError('');
    try {
      // Without a session the API client sends the user to sign in; the
      // token stays in this tab and sign-in returns here.
      const res = await api.post<{ workspace: { slug: string } }>('/invitations/accept', { token });
      clearPendingInvitation();
      router.push(`/w/${res.data.workspace.slug}`);
    } catch (err) {
      const code = (err as ErrorBody).response?.data?.code ?? '';
      if (code === 'INVITATION_USED' || code === 'INVITATION_EXPIRED' || code === 'INVITATION_NOT_FOUND') {
        clearPendingInvitation();
      }
      setError(INVITATION_ERRORS[code] ?? 'The invitation could not be accepted.');
    } finally {
      setAccepting(false);
    }
  };

  const registerHref = invitation
    ? `/register?email=${encodeURIComponent(invitation.email)}&next=${encodeURIComponent('/invite')}`
    : '/register';

  return (
    <div className={`min-h-screen ${theme.colors.bg.primary} ${theme.colors.text.primary} flex flex-col justify-center items-center px-4 font-sans`}>
      <div className="w-full max-w-sm space-y-5">
        <h1 className="text-lg font-medium tracking-tight text-white">TaskFlow AI</h1>
        <Alert message={error} type="error" />
        {loading && <p className={`text-xs ${theme.colors.text.secondary}`}>Loading invitation…</p>}
        {invitation && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              {invitation.inviterName ? <b className="text-white">{invitation.inviterName}</b> : 'Someone'} invited you to join{' '}
              <b className="text-white">{invitation.workspaceName}</b> as <span className="font-mono text-xs">{invitation.role}</span>.
            </p>
            <p className={`text-xs ${theme.colors.text.secondary}`}>
              Invitation sent to {invitation.email}. Expires {new Date(invitation.expiresAt).toLocaleString()}.
            </p>
            {invitation.status === 'pending' ? (
              <>
                <button
                  onClick={accept}
                  disabled={accepting}
                  className={`w-full ${theme.colors.accent.DEFAULT} text-xs font-medium px-4 py-2 rounded-md disabled:opacity-50`}
                >
                  {accepting ? 'Joining…' : 'Accept invitation'}
                </button>
                <p className={`text-xs ${theme.colors.text.secondary}`}>
                  You will be asked to sign in first if needed. No account yet?{' '}
                  <Link href={registerHref} className="text-white underline">
                    Create one
                  </Link>
                  , then come back to this page.
                </p>
              </>
            ) : (
              <p className="text-xs text-amber-400">{STATUS_TEXT[invitation.status]}</p>
            )}
          </div>
        )}
        <Link href="/workspaces" className={`block text-xs ${theme.colors.text.secondary} hover:text-white`}>
          Go to your workspaces
        </Link>
      </div>
    </div>
  );
}
