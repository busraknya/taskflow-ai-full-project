'use client';

import { useState } from 'react';
import { theme } from '@/lib/theme';

interface AddMemberFormProps {
  onAdd: (email: string, role: string) => Promise<void>;
  adding: boolean;
}

export function AddMemberForm({ onAdd, adding }: AddMemberFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const confirmed = window.confirm(`Are you sure you want to add ${email} with role ${role}?`);
    if (!confirmed) return;

    try {
      await onAdd(email, role); // <-- onAdd kullanılıyor
      setEmail(''); 
    } catch (err) {
      // Hata
    }
  };

  return (
    <div className={`${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-lg p-5 space-y-4`}>
      <h2 className="text-xs font-medium text-white uppercase tracking-wider">Add Team Member</h2>
      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="colleague@company.com"
          className={`flex-1 ${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none`}
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className={`${theme.colors.bg.primary} border ${theme.colors.border.primary} rounded-md px-3 py-2 text-sm text-white focus:outline-none`}
        >
          <option value="ADMIN">Admin</option>
          <option value="MEMBER">Member</option>
          <option value="VIEWER">Viewer</option>
        </select>
        <button
          type="submit"
          disabled={adding}
          className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50`}
        >
          {adding ? 'Adding...' : 'Add Member'}
        </button>
      </form>
    </div>
  );
}