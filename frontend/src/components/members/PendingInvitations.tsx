'use client';

import { useState } from 'react';
import { ROLE_LABEL } from '@/lib/labels';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/format';

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
    <section aria-labelledby="pending-heading" className="flex flex-col gap-3">
      <h2 id="pending-heading" className="text-[13px] font-semibold text-fg">
        Pending invitations <span className="font-normal text-fg-subtle tabular-nums">{invitations.length}</span>
      </h2>
      <ul className="divide-y divide-line rounded-card border border-line bg-surface">
        {invitations.map((invitation) => (
          <li key={invitation.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-fg">{invitation.email}</p>
              <p className="text-[13px] text-fg-muted">
                {ROLE_LABEL[invitation.role] ?? invitation.role}
                {invitation.invitedBy && ` · invited by ${invitation.invitedBy.fullName}`}
              </p>
            </div>
            {invitation.expired ? (
              <Badge tone="warning">Expired</Badge>
            ) : (
              <span className="text-xs text-fg-subtle">Expires {formatDate(invitation.expiresAt)}</span>
            )}
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" disabled={busy === invitation.id} onClick={() => run(invitation.id, onResend)}>
                {invitation.expired ? 'Renew link' : 'Resend'}
              </Button>
              <Button size="sm" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" disabled={busy === invitation.id} onClick={() => run(invitation.id, onRevoke)}>
                Revoke
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
