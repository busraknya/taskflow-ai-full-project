'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { WorkspaceContext, type WorkspaceSummary } from '@/lib/workspace';
import { useAuthStore } from '@/store/useAuthStore';
import { AppShell } from '@/components/layout/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageLoader } from '@/components/ui/Spinner';

/** Loads the workspace once for every page under /w/[workspaceSlug]. */
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { workspaceSlug } = useParams<{ workspaceSlug: string }>();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState('');
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);

  useEffect(() => {
    let cancelled = false;
    api
      .get<WorkspaceSummary[]>('/workspaces')
      .then((res) => !cancelled && setWorkspaces(res.data))
      .catch(() => !cancelled && setError('Your workspaces could not be loaded. Check your connection and reload the page.'));
    return () => {
      cancelled = true;
    };
  }, []);

  // The session survives a reload through the refresh cookie; the profile does not.
  useEffect(() => {
    if (user) return;
    api
      .get('/users/me')
      .then((res) => setUser(res.data))
      .catch(() => undefined);
  }, [user, setUser]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-24">
        <EmptyState title="Something went wrong" description={error} />
      </div>
    );
  }
  if (!workspaces) return <PageLoader label="Loading workspace…" />;

  const workspace = workspaces.find((w) => w.slug === workspaceSlug);
  if (!workspace) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-24">
        <EmptyState
          title="Workspace not found"
          description="It may have been renamed, or you are not a member of it."
          action={
            <Link href="/workspaces" className="text-sm font-medium text-accent hover:underline">
              Go to your workspaces
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        workspaces,
        canManage: workspace.role === 'OWNER' || workspace.role === 'ADMIN',
        canEdit: workspace.role !== 'VIEWER',
      }}
    >
      <AppShell workspace={workspace} workspaces={workspaces}>
        {children}
      </AppShell>
    </WorkspaceContext.Provider>
  );
}
