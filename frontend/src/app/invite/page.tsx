'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/labels';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { PageLoader } from '@/components/ui/Spinner';
import { formatDateTime } from '@/lib/format';
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
    <AuthLayout
      title={invitation ? `Join ${invitation.workspaceName}` : 'Workspace invitation'}
      footer={
        <Link href="/workspaces" className="font-medium text-accent hover:underline">
          Go to your workspaces
        </Link>
      }
    >
      <div className="flex flex-col gap-4">
        <Alert message={error} />
        {loading && <PageLoader label="Loading invitation…" />}
        {invitation && (
          <>
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">{invitation.inviterName ?? 'A workspace admin'}</span> invited{' '}
              <span className="font-medium text-fg">{invitation.email}</span> to join as{' '}
              <span className="font-medium text-fg">{ROLE_LABEL[invitation.role] ?? invitation.role}</span>.
            </p>
            {invitation.status === 'pending' ? (
              <>
                <Button variant="primary" className="w-full" loading={accepting} onClick={accept}>
                  Accept invitation
                </Button>
                <p className="text-[13px] text-fg-muted">
                  You will be asked to sign in first if needed. No account yet?{' '}
                  <Link href={registerHref} className="font-medium text-accent hover:underline">
                    Create one
                  </Link>{' '}
                  and you will come back here.
                </p>
                <p className="text-xs text-fg-subtle">
                  Expires {formatDateTime(invitation.expiresAt)}.
                </p>
              </>
            ) : (
              <Alert message={STATUS_TEXT[invitation.status]} />
            )}
          </>
        )}
      </div>
    </AuthLayout>
  );
}
