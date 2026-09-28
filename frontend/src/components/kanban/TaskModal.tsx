'use client';

import { useState } from 'react';
import { theme } from '@/lib/theme';

interface Member {
  user: { id: string; fullName: string; email: string };
}

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (taskData: { title: string; description: string; priority: number; assigneeId: string; dueDate: string }) => void;
  members: Member[];
}

export function TaskModal({ isOpen, onClose, onSubmit, members }: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(0);
  const [assigneeId, setAssigneeId] = useState('');
  const [dueDate, setDueDate] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ title, description, priority: Number(priority), assigneeId, dueDate });
    setTitle('');
    setDescription('');
    setPriority(0);
    setAssigneeId('');
    setDueDate('');
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className={`w-full max-w-md ${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-xl p-6 space-y-4 shadow-2xl`}>
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-medium text-white">Create New Task</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xs">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Task Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none`}
              placeholder="Fix authentication bug..."
            />
          </div>

          <div>
            <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`w-full ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none`}
              placeholder="Optional details..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Priority (0-3)</label>
              <select
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                className={`w-full ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none`}
              >
                <option value={0}>P0 - Normal</option>
                <option value={1}>P1 - Low</option>
                <option value={2}>P2 - Medium</option>
                <option value={3}>P3 - Urgent</option>
              </select>
            </div>

            <div>
              <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`w-full ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Assignee</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className={`w-full ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none`}
            >
              <option value="">Unassigned</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.fullName} ({m.user.email})</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-4 py-1.5 rounded-md`}
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}