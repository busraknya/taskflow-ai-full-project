'use client';

import { useState } from 'react';
import { theme } from '@/lib/theme';

export interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  invitedBy: { fullName: string } | null;
}

interface PendingInvitationsProps {
  invitations: PendingInvitation[];
  onResend: (id: string) => Promise<void>;
  onRevoke: (id: string) => Promise<void>;
}

/** Open invitations with resend (new link) and revoke actions. */
export function PendingInvitations({ invitations, onResend, onRevoke }: PendingInvitationsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  if (invitations.length === 0) return null;

  const run = async (id: string, action: (id: string) => Promise<void>) => {
    setBusy(id);
    try {
      await action(id);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-lg p-5 space-y-3`}>
      <h2 className="text-xs font-medium text-white uppercase tracking-wider">Pending invitations</h2>
      <ul className="divide-y divide-zinc-800">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="py-2 flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0">
              <p className="text-zinc-200 truncate">{invitation.email}</p>
              <p className="text-zinc-500">
                {invitation.role} ·{' '}
                {invitation.expired
                  ? 'expired'
                  : `expires ${new Date(invitation.expiresAt).toLocaleDateString()}`}
                {invitation.invitedBy && ` · invited by ${invitation.invitedBy.fullName}`}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                disabled={busy === invitation.id}
                onClick={() => run(invitation.id, onResend)}
                className="px-2 py-1 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
              >
                {invitation.expired ? 'Renew link' : 'Resend'}
              </button>
              <button
                disabled={busy === invitation.id}
                onClick={() => run(invitation.id, onRevoke)}
                className="px-2 py-1 rounded bg-zinc-800 text-red-300 hover:bg-zinc-700 disabled:opacity-50"
              >
                Revoke
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
