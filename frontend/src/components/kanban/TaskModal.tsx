'use client';

import { useState } from 'react';
import { getErrorMessage, type ApiErrorBody } from '@/lib/errors';
import { PRIORITY_LABEL } from '@/lib/labels';
import type { Member } from '@/lib/tasks';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';

export interface NewTask {
  title: string;
  description: string;
  priority: number;
  assigneeId: string;
  dueDate: string;
}

const EMPTY: NewTask = { title: '', description: '', priority: 0, assigneeId: '', dueDate: '' };

interface TaskModalProps {
  open: boolean;
  onClose: () => void;
  /** Rejects with the API error; the form keeps its values. */
  onSubmit: (task: NewTask) => Promise<void>;
  members: Member[];
}

export function TaskModal({ open, onClose, onSubmit, members }: TaskModalProps) {
  const [task, setTask] = useState<NewTask>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof NewTask>(key: K, value: NewTask[K]) => setTask((t) => ({ ...t, [key]: value }));

  const close = () => {
    setError('');
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await onSubmit(task);
      setTask(EMPTY);
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
      title="New task"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" type="submit" form="new-task-form" loading={saving}>
            Create task
          </Button>
        </>
      }
    >
      <form id="new-task-form" onSubmit={submit} className="flex flex-col gap-4">
        <Alert message={error} />
        <Field label="Title">
          {(props) => (
            <Input {...props} data-autofocus required maxLength={200} value={task.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Review the onboarding emails" />
          )}
        </Field>
        <Field label="Description" hint="Optional">
          {(props) => <Textarea {...props} value={task.description} onChange={(e) => set('description', e.target.value)} />}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Priority">
            {(props) => (
              <Select {...props} value={task.priority} onChange={(e) => set('priority', Number(e.target.value))}>
                {[3, 2, 0, 1].map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Due date">
            {(props) => <Input {...props} type="date" value={task.dueDate} onChange={(e) => set('dueDate', e.target.value)} />}
          </Field>
        </div>
        <Field label="Assignee">
          {(props) => (
            <Select {...props} value={task.assigneeId} onChange={(e) => set('assigneeId', e.target.value)}>
              <option value="">Unassigned</option>
              {/* Pending invitees cannot be assigned until they accept. */}
              {members
                .filter((m) => m.status !== 'PENDING')
                .map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.fullName ?? m.user.email}
                  </option>
                ))}
            </Select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
