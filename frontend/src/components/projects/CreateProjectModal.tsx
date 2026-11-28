'use client';

import { useState } from 'react';
import { getErrorMessage, type ApiErrorBody } from '@/lib/errors';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Textarea } from '@/components/ui/Field';

interface CreateProjectModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string) => Promise<void>;
}

export function CreateProjectModal({ open, onClose, onSubmit }: CreateProjectModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
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
      await onSubmit(name, description);
      setName('');
      setDescription('');
      onClose();
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
      title="New project"
      description="Each project has its own board."
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-project-form" loading={saving}>
            Create project
          </Button>
        </>
      }
    >
      <form id="new-project-form" onSubmit={submit} className="flex flex-col gap-4">
        <Alert message={error} />
        <Field label="Name">
          {(props) => <Input {...props} data-autofocus required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website relaunch" />}
        </Field>
        <Field label="Description" hint="Optional">
          {(props) => <Textarea {...props} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
      </form>
    </Dialog>
  );
}
