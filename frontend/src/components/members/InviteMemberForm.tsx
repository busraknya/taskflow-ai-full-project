'use client';

import { useState } from 'react';
import { theme } from '@/lib/theme';

interface InviteFormProps {
  onInvite: (email: string, role: string) => void;
  inviting: boolean;
}

export function InviteMemberForm({ onInvite, inviting }: InviteFormProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('MEMBER');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const confirmed = window.confirm(`Are you sure you want to invite ${email} with role ${role}?`);
    if (!confirmed) return;

    try {
        await onInvite(email, role); // <-- await EKLENDİ!
        setEmail(''); // Sadece api başarılı olup buraya düşerse formu temizle
    } catch (err) {
        // Üst bileşenden gelen hatayı burada yakala, formu temizleme!
    }
  };

  return (
    <div className={`${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-lg p-5 space-y-4`}>
      <h2 className="text-xs font-medium text-white uppercase tracking-wider">Invite New Member</h2>
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
          disabled={inviting}
          className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50`}
        >
          {inviting ? 'Inviting...' : 'Invite'}
        </button>
      </form>
    </div>
  );
}