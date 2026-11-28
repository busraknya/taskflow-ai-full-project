'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, KanbanSquare, LogOut, Menu, Settings, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ROLE_LABEL } from '@/lib/labels';
import type { WorkspaceSummary } from '@/lib/workspace';
import { useAuthStore } from '@/store/useAuthStore';
import { Logo, LogoMark } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { SettingsModal } from '@/components/settings/SettingsModal';

interface AppShellProps {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  children: ReactNode;
}

/** Sidebar navigation for a workspace; a drawer below the md breakpoint. */
export function AppShell({ workspace, workspaces, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r border-line bg-surface md:flex">
        <SidebarContent workspace={workspace} workspaces={workspaces} onSettings={() => setSettingsOpen(true)} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 bg-overlay md:hidden" onMouseDown={(e) => e.target === e.currentTarget && setDrawerOpen(false)}>
          <aside className="flex h-full w-64 border-r border-line bg-surface animate-[slide-in_160ms_ease-out]">
            <SidebarContent
              workspace={workspace}
              workspaces={workspaces}
              onNavigate={() => setDrawerOpen(false)}
              onSettings={() => {
                setDrawerOpen(false);
                setSettingsOpen(true);
              }}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 md:hidden">
          <Button variant="ghost" icon size="sm" aria-label="Open navigation" onClick={() => setDrawerOpen(true)}>
            <Menu size={18} />
          </Button>
          <LogoMark />
          <span className="truncate text-sm font-semibold">{workspace.name}</span>
        </header>
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>

      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function SidebarContent({
  workspace,
  workspaces,
  onNavigate,
  onSettings,
}: {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  onNavigate?: () => void;
  onSettings: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();
  const base = `/w/${workspace.slug}`;
  const nav = [
    { href: base, label: 'Board', icon: KanbanSquare },
    { href: `${base}/members`, label: 'Members', icon: Users },
    { href: `${base}/activity`, label: 'Activity', icon: Activity },
  ];

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
    <div className="flex w-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Link href="/workspaces" onClick={onNavigate} aria-label="All workspaces">
          <Logo />
        </Link>
      </div>

      <div className="px-3 pb-3">
        <label htmlFor="workspace-switcher" className="sr-only">
          Workspace
        </label>
        <Select
          id="workspace-switcher"
          value={workspace.slug}
          onChange={(e) => {
            onNavigate?.();
            router.push(e.target.value === '__all' ? '/workspaces' : `/w/${e.target.value}`);
          }}
          className="font-medium"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.slug}>
              {w.name}
            </option>
          ))}
          <option value="__all">All workspaces…</option>
        </Select>
        <p className="px-1 pt-1.5 text-xs text-fg-subtle">Your role: {ROLE_LABEL[workspace.role] ?? workspace.role}</p>
      </div>

      <nav aria-label="Workspace" className="flex flex-col gap-0.5 px-3">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-9 items-center gap-2.5 rounded-control px-2.5 text-sm transition-colors',
                active ? 'bg-subtle font-medium text-fg' : 'text-fg-muted hover:bg-subtle hover:text-fg',
              )}
            >
              <Icon size={16} className={active ? 'text-accent' : 'text-fg-subtle'} aria-hidden="true" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-2.5 border-t border-line px-3 py-3">
        <Avatar name={user?.fullName} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-fg">{user?.fullName ?? 'Signed in'}</p>
          <p className="truncate text-xs text-fg-subtle">{user?.email}</p>
        </div>
        <Button variant="ghost" size="sm" icon aria-label="Account settings" onClick={onSettings}>
          <Settings size={16} />
        </Button>
        <Button variant="ghost" size="sm" icon aria-label="Sign out" onClick={signOut}>
          <LogOut size={16} />
        </Button>
      </div>
    </div>
  );
}

/** Title row for a page inside the shell. */
export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-line bg-surface px-4 py-4 sm:px-6 sm:py-5">
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <div className="text-[13px] text-fg-muted">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
