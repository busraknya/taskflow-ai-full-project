'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { Alert } from '@/components/ui/Alert';
import { WorkspaceCard } from '@/components/workspaces/WorkspaceCard';
import { CreateWorkspaceModal } from '@/components/workspaces/CreateWorkspaceModal';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  role: string;
  invitationExpiresAt: string;
  workspace: Pick<Workspace, 'id' | 'name' | 'slug'>;
  invitedBy: { fullName: string; email: string };
}

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const fetchWorkspaces = async () => {
    try {
      const res = await api.get<Workspace[]>('/workspaces');
      setWorkspaces(res.data);
    } catch {
      setError('Failed to load workspaces.');
    }
  };

  const handleInvitation = async (
    invitation: WorkspaceInvitation,
    action: 'accept' | 'decline',
  ) => {
    setPendingAction(invitation.id);
    setError('');
    try {
      if (action === 'accept') {
        await api.post(
          `/workspaces/${invitation.workspaceId}/members/accept`,
        );
        await fetchWorkspaces();
      } else {
        await api.delete(
          `/workspaces/${invitation.workspaceId}/members/invitation`,
        );
      }
      setInvitations((current) =>
        current.filter((item) => item.id !== invitation.id),
      );
    } catch {
      setError(
        action === 'accept'
          ? 'Failed to accept workspace invitation. It may have expired.'
          : 'Failed to decline workspace invitation.',
      );
    } finally {
      setPendingAction(null);
    }
  };

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      api.get<Workspace[]>('/workspaces'),
      api.get<WorkspaceInvitation[]>('/workspaces/invitations'),
    ])
      .then(([workspaceResponse, invitationResponse]) => {
        if (cancelled) return;
        setWorkspaces(workspaceResponse.data);
        setInvitations(invitationResponse.data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load workspaces and invitations.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className={`min-h-screen ${theme.colors.bg.primary} flex items-center justify-center text-sm text-zinc-500`}>
        Loading workspaces...
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${theme.colors.bg.primary} ${theme.colors.text.primary} p-8 font-sans`}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-lg font-medium text-white tracking-tight">Workspaces</h1>
            <p className={`text-xs ${theme.colors.text.secondary}`}>
              Select a workspace or create a new one.
            </p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-3 py-1.5 rounded-md transition-colors`}
          >
            New Workspace
          </button>
        </div>

        <Alert message={error} type="error" />

        {invitations.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-white">Pending invitations</h2>
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-amber-900/60 bg-amber-950/20 p-4"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white">
                    {invitation.workspace.name}
                  </p>
                  <p className="text-xs text-zinc-400">
                    Invited by {invitation.invitedBy.fullName} · {invitation.role}
                  </p>
                  <p className="text-xs text-zinc-500">
                    Expires {new Date(invitation.invitationExpiresAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={pendingAction === invitation.id}
                    onClick={() => handleInvitation(invitation, 'decline')}
                    className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    disabled={pendingAction === invitation.id}
                    onClick={() => handleInvitation(invitation, 'accept')}
                    className={`${theme.colors.accent.DEFAULT} rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50`}
                  >
                    {pendingAction === invitation.id ? 'Please wait...' : 'Accept'}
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {workspaces.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-zinc-800 rounded-lg">
            <p className={`text-xs ${theme.colors.text.secondary} mb-3`}>
              No workspaces found.
            </p>
            <button
              onClick={() => setShowNewModal(true)}
              className="text-xs text-white underline hover:text-zinc-300"
            >
              Create your first workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                name={workspace.name}
                slug={workspace.slug}
                role={workspace.role}
                onClick={() => router.push(`/w/${workspace.slug}`)}
              />
            ))}
          </div>
        )}

        <CreateWorkspaceModal
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onCreated={fetchWorkspaces}
          onError={setError}
          api={api}
        />
      </div>
    </div>
  );
}
