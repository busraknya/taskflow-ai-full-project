'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { getErrorMessage, type ApiErrorBody } from '@/lib/errors';
import { useAuthStore } from '@/store/useAuthStore';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { useFeedback } from '@/components/ui/Feedback';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'security' | 'notifications';

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { toast } = useFeedback();
  const setAccessToken = useAuthStore((state) => state.setAccessToken);
  const [tab, setTab] = useState<Tab>('security');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [assignmentEmails, setAssignmentEmails] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    api
      .get<Array<{ category: string; emailEnabled: boolean }>>('/users/me/notification-preferences')
      .then((res) => {
        if (cancelled) return;
        // No stored preference means the default: emails on.
        setAssignmentEmails(res.data.find((p) => p.category === 'task.assigned')?.emailEnabled ?? true);
      })
      .catch(() => !cancelled && setAssignmentEmails(true));
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const close = () => {
    setCurrentPassword('');
    setNewPassword('');
    setError('');
    setTab('security');
    onClose();
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.patch<{ accessToken: string }>('/users/me/password', { currentPassword, newPassword });
      // Other sessions were signed out; this one continues on the new token.
      setAccessToken(res.data.accessToken);
      setCurrentPassword('');
      setNewPassword('');
      toast('Password changed. You were signed out on your other devices.');
    } catch (err) {
      setError(getErrorMessage((err as { response?: { data?: ApiErrorBody } }).response?.data));
    } finally {
      setSaving(false);
    }
  };

  const toggleAssignmentEmails = async () => {
    const enabled = !assignmentEmails;
    setAssignmentEmails(enabled);
    try {
      await api.patch('/users/me/notification-preferences', { category: 'task.assigned', emailEnabled: enabled });
      toast(enabled ? 'Assignment emails turned on.' : 'Assignment emails turned off.');
    } catch {
      setAssignmentEmails(!enabled);
      toast('Your preference could not be saved. Try again.', 'error');
    }
  };

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'security', label: 'Password' },
    { id: 'notifications', label: 'Notifications' },
  ];

  return (
    <Dialog open={isOpen} onClose={close} title="Account settings">
      <div className="flex flex-col gap-5">
        <div role="tablist" aria-label="Settings sections" className="flex gap-1 border-b border-line">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              id={`settings-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`settings-panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                '-mb-px border-b-2 px-2.5 pb-2 text-sm transition-colors',
                tab === t.id ? 'border-accent font-medium text-fg' : 'border-transparent text-fg-muted hover:text-fg',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'security' ? (
          <form id="settings-panel-security" role="tabpanel" aria-labelledby="settings-tab-security" onSubmit={changePassword} className="flex flex-col gap-4">
            <Alert message={error} />
            <Field label="Current password">
              {(props) => <Input {...props} type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />}
            </Field>
            <Field label="New password" hint="At least 8 characters, including a number. Your other devices will be signed out.">
              {(props) => (
                <Input {...props} type="password" autoComplete="new-password" required minLength={8} pattern=".*\d.*" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              )}
            </Field>
            <div className="flex justify-end">
              <Button type="submit" variant="primary" loading={saving}>
                Change password
              </Button>
            </div>
          </form>
        ) : (
          <div id="settings-panel-notifications" role="tabpanel" aria-labelledby="settings-tab-notifications" className="flex items-start justify-between gap-6">
            <div className="space-y-0.5">
              <p id="assignment-emails-label" className="text-sm font-medium text-fg">
                Task assignment emails
              </p>
              <p className="text-[13px] text-fg-muted">Get an email when someone assigns a task to you. Requires email to be set up on this server.</p>
            </div>
            <button
              role="switch"
              aria-checked={assignmentEmails === true}
              aria-labelledby="assignment-emails-label"
              disabled={assignmentEmails === null}
              onClick={toggleAssignmentEmails}
              className={cn(
                'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
                assignmentEmails ? 'bg-accent' : 'bg-line-strong',
              )}
            >
              <span className={cn('inline-block size-4 rounded-full bg-surface shadow-sm transition-transform', assignmentEmails ? 'translate-x-4.5' : 'translate-x-0.5')} />
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
