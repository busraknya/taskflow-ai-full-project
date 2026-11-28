'use client';

import { useState } from 'react';

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
    <div className="border border-zinc-700 bg-zinc-900 rounded-lg p-4 space-y-2 text-xs" role="status">
      <p className="text-zinc-200">
        {emailDelivery === 'queued'
          ? `An invitation email is on its way to ${email}. You can also share this link with them directly:`
          : `Email delivery is not configured on this server, so no email was sent. Share this link with ${email}:`}
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={acceptUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 font-mono text-[11px] text-zinc-300"
          aria-label="Invitation link"
        />
        <button onClick={copy} className="px-3 py-1.5 rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-zinc-500">
        Anyone with this link can join with the shown role until it is used, revoked or expires (7 days). It works for
        people who do not have an account yet.
      </p>
      <button onClick={onClose} className="text-zinc-400 hover:text-white">
        Dismiss
      </button>
    </div>
  );
}
