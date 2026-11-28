'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { ROLE_LABEL } from '@/lib/labels';
import type { WorkspaceSummary } from '@/lib/workspace';
import { TopBar } from '@/components/layout/TopBar';
import { CreateWorkspaceModal } from '@/components/workspaces/CreateWorkspaceModal';
import { WorkspaceCard } from '@/components/workspaces/WorkspaceCard';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useFeedback } from '@/components/ui/Feedback';
import { PageLoader } from '@/components/ui/Spinner';
import { formatDate } from '@/lib/format';

interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  role: string;
  invitationExpiresAt: string | null;
  workspace: Pick<WorkspaceSummary, 'id' | 'name' | 'slug'>;
  invitedBy: { fullName: string; email: string } | null;
}

export default function WorkspacesPage() {
  const router = useRouter();
  const { toast } = useFeedback();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const load = useCallback(
    () =>
      Promise.all([api.get<WorkspaceSummary[]>('/workspaces'), api.get<WorkspaceInvitation[]>('/workspaces/invitations')]).then(
        ([ws, inv]) => {
          setWorkspaces(ws.data);
          setInvitations(inv.data);
        },
        () => {
          setWorkspaces((current) => current ?? []);
          setError('Your workspaces could not be loaded. Check your connection and reload the page.');
        },
      ),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const respond = async (invitation: WorkspaceInvitation, action: 'accept' | 'decline') => {
    setPendingAction(invitation.id);
    try {
      if (action === 'accept') {
        await api.post(`/workspaces/${invitation.workspaceId}/members/accept`);
        toast(`You joined ${invitation.workspace.name}.`);
      } else {
        await api.delete(`/workspaces/${invitation.workspaceId}/members/invitation`);
        toast('Invitation declined.');
      }
      await load();
    } catch {
      toast(action === 'accept' ? 'The invitation could not be accepted. It may have expired.' : 'The invitation could not be declined.', 'error');
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Workspaces</h1>
            <p className="text-sm text-fg-muted">Choose where you want to work.</p>
          </div>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus size={16} aria-hidden="true" />
            New workspace
          </Button>
        </div>

        <Alert message={error} />

        {workspaces === null ? (
          <PageLoader label="Loading workspaces…" />
        ) : (
          <>
            {invitations.length > 0 && (
              <section aria-labelledby="invitations-heading" className="flex flex-col gap-3">
                <h2 id="invitations-heading" className="text-[13px] font-semibold text-fg">
                  Invitations
                </h2>
                {invitations.map((invitation) => (
                  <div key={invitation.id} className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface px-4 py-3.5">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="text-sm font-medium text-fg">{invitation.workspace.name}</p>
                      <p className="text-[13px] text-fg-muted">
                        {invitation.invitedBy?.fullName ?? 'A workspace admin'} invited you as {ROLE_LABEL[invitation.role] ?? invitation.role}
                        {invitation.invitationExpiresAt && ` · expires ${formatDate(invitation.invitationExpiresAt)}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" disabled={pendingAction === invitation.id} onClick={() => respond(invitation, 'decline')}>
                        Decline
                      </Button>
                      <Button size="sm" variant="primary" loading={pendingAction === invitation.id} onClick={() => respond(invitation, 'accept')}>
                        Accept
                      </Button>
                    </div>
                  </div>
                ))}
              </section>
            )}

            {workspaces.length === 0 ? (
              <EmptyState
                title="No workspaces yet"
                description="Create a workspace for your team, or ask an admin to invite you to an existing one."
                action={
                  <Button variant="primary" onClick={() => setCreateOpen(true)}>
                    Create a workspace
                  </Button>
                }
              />
            ) : (
              <section aria-label="Your workspaces" className="flex flex-col gap-2">
                {workspaces.map((w) => (
                  <WorkspaceCard key={w.id} name={w.name} slug={w.slug} role={w.role} />
                ))}
              </section>
            )}
          </>
        )}
      </main>

      <CreateWorkspaceModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(slug) => {
          setCreateOpen(false);
          toast('Workspace created.');
          router.push(`/w/${slug}`);
        }}
      />
    </div>
  );
}
