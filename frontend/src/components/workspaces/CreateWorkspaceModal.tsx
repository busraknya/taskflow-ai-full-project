'use client';

import { useState } from 'react';
import { theme } from '@/lib/theme';

interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
  api: any;
}

export function CreateWorkspaceModal({ isOpen, onClose, onCreated, onError, api }: CreateModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [creating, setCreating] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    onError('');

    try {
      await api.post('/workspaces', { name, slug });
      setName('');
      setSlug('');
      onCreated();
      onClose();
    } catch (err: any) {
      onError(err.response?.data?.message || 'Failed to create workspace.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className={`w-full max-w-md ${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-xl p-6 space-y-4 shadow-2xl`}>
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-medium text-white">Create Workspace</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-xs">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Workspace Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
              }}
              className={`w-full ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:${theme.colors.border.focus}`}
              placeholder="Acme Inc."
            />
          </div>

          <div>
            <label className={`block text-xs font-medium ${theme.colors.text.secondary} mb-1.5`}>Slug (URL friendly)</label>
            <input
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className={`w-full ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:${theme.colors.border.focus} font-mono text-xs`}
              placeholder="acme-inc"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs text-zinc-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-4 py-1.5 rounded-md transition-colors disabled:opacity-50`}
            >
              {creating ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}