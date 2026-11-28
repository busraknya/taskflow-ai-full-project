'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface InviteLinkNoticeProps {
  email: string;
  acceptUrl: string;
  emailDelivery: 'queued' | 'disabled';
  onClose: () => void;
}

/**
 * Shows the single-use invitation link to the inviter. When email delivery is
 * not configured, sharing this link is the only way to invite someone.
 */
export function InviteLinkNotice({ email, acceptUrl, emailDelivery, onClose }: InviteLinkNoticeProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(acceptUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div role="status" className="flex flex-col gap-3 rounded-card border border-line bg-accent-soft/60 p-5">
      <p className="text-sm text-fg">
        {emailDelivery === 'queued'
          ? `An invitation email is on its way to ${email}. You can also send them this link yourself.`
          : `Email is not set up on this server, so no email was sent. Send this link to ${email}.`}
      </p>
      <div className="flex gap-2">
        <label htmlFor="invite-link" className="sr-only">
          Invitation link
        </label>
        <input
          id="invite-link"
          readOnly
          value={acceptUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 min-w-0 flex-1 rounded-control border border-line bg-surface px-3 font-mono text-[13px] text-fg-muted"
        />
        <Button onClick={copy}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <p className="text-[13px] text-fg-muted">
        Anyone with this link can join with the chosen role until it is used, revoked or expires in 7 days.
      </p>
      <div>
        <Button variant="ghost" size="sm" onClick={onClose} className="-ml-3">
          Done
        </Button>
      </div>
    </div>
  );
}
