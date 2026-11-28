'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LogOut, Settings } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { SettingsModal } from '@/components/settings/SettingsModal';

/** Header for pages outside a workspace. */
export function TopBar() {
  const router = useRouter();
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const signOut = async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // The local session is cleared either way.
    }
    clearAuth();
    router.push('/login');
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-4 sm:px-6">
      <Link href="/workspaces" aria-label="All workspaces">
        <Logo />
      </Link>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings size={16} aria-hidden="true" />
          Settings
        </Button>
        <Button variant="ghost" size="sm" onClick={signOut}>
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </Button>
      </div>
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
