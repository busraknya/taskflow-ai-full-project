'use client';

import { useState } from 'react';
import { ROLE_LABEL } from '@/lib/labels';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';

interface AddMemberFormProps {
  /** Resolves when the invitation was created; the email is then cleared. */
  onAdd: (email: string, role: string) => Promise<boolean>;
}

export function AddMemberForm({ onAdd }: AddMemberFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');
  const [sending, setSending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    if (await onAdd(email, role)) setEmail('');
    setSending(false);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold text-fg">Invite someone</h2>
        <p className="text-[13px] text-fg-muted">They get a link to join. It works even if they do not have an account yet.</p>
      </div>
      <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_10rem_auto]">
        <Field label="Email">
          {(props) => <Input {...props} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />}
        </Field>
        <Field label="Role">
          {(props) => (
            <Select {...props} value={role} onChange={(e) => setRole(e.target.value)}>
              {['ADMIN', 'MEMBER', 'VIEWER'].map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button type="submit" variant="primary" loading={sending}>
          Send invitation
        </Button>
      </div>
    </form>
  );
}
