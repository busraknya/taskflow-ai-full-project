'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { getErrorMessage, type ApiErrorBody } from '@/lib/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';

const toSlug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

interface CreateWorkspaceModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (slug: string) => void;
}

export function CreateWorkspaceModal({ open, onClose, onCreated }: CreateWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    setError('');
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // Date-only due dates end at midnight in the workspace time zone.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api.post('/workspaces', { name, slug, ...(timezone ? { timezone } : {}) });
      setName('');
      setSlug('');
      setSlugEdited(false);
      onCreated(slug);
    } catch (err) {
      setError(getErrorMessage((err as { response?: { data?: ApiErrorBody } }).response?.data));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="New workspace"
      description="A workspace holds your team's projects, members and task history."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-workspace-form" loading={saving}>
            Create workspace
          </Button>
        </>
      }
    >
      <form id="new-workspace-form" onSubmit={submit} className="flex flex-col gap-4">
        <Alert message={error} />
        <Field label="Name">
          {(props) => (
            <Input
              {...props}
              data-autofocus
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugEdited) setSlug(toSlug(e.target.value));
              }}
              placeholder="e.g. Acme Design Team"
            />
          )}
        </Field>
        <Field label="URL" hint="Lowercase letters, numbers and hyphens. Used in links to this workspace.">
          {(props) => (
            <div className="flex items-center rounded-control border border-line bg-subtle focus-within:border-accent">
              <span className="pl-3 font-mono text-[13px] text-fg-subtle">/w/</span>
              <Input
                {...props}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true);
                  setSlug(e.target.value);
                }}
                className="border-0 bg-transparent pl-0.5 font-mono text-[13px] focus:ring-0"
              />
            </div>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
