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

export default function WorkspacesPage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showNewModal, setShowNewModal] = useState(false);

  const fetchWorkspaces = async () => {
    try {
      const res = await api.get('/workspaces');
      setWorkspaces(res.data);
    } catch (err: any) {
      setError('Failed to load workspaces.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  if (loading) {
    return <div className={`min-h-screen ${theme.colors.bg.primary} flex items-center justify-center text-sm text-zinc-500`}>Loading workspaces...</div>;
  }

  return (
    <div className={`min-h-screen ${theme.colors.bg.primary} ${theme.colors.text.primary} p-8 font-sans`}>
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <div>
            <h1 className="text-lg font-medium text-white tracking-tight">Workspaces</h1>
            <p className={`text-xs ${theme.colors.text.secondary}`}>Select a workspace or create a new one.</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className={`${theme.colors.accent.DEFAULT} text-xs font-medium px-3 py-1.5 rounded-md transition-colors`}
          >
            New Workspace
          </button>
        </div>

        <Alert message={error} type="error" />

        {/* Workspace Listesi */}
        {workspaces.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-zinc-800 rounded-lg">
            <p className={`text-xs ${theme.colors.text.secondary} mb-3`}>No workspaces found.</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="text-xs text-white underline hover:text-zinc-300"
            >
              Create your first workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {workspaces.map((ws) => (
              <WorkspaceCard
                key={ws.id}
                name={ws.name}
                slug={ws.slug}
                role={ws.role}
                onClick={() => router.push(`/w/${ws.slug}`)}
              />
            ))}
          </div>
        )}

        {/* Modül */}
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