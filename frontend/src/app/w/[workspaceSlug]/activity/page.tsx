'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { theme } from '@/lib/theme';
import { Alert } from '@/components/ui/Alert';
import { Activity, ArrowLeft } from 'lucide-react';

interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  metadata: any;
  createdAt: string;
}

export default function ActivityPage() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug as string;
  const router = useRouter();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        const res = await api.get('/workspaces');
        const currentWs = res.data.find((w: any) => w.slug === workspaceSlug);
        if (!currentWs) {
          setError('Workspace not found.');
          setLoading(false);
          return;
        }
        fetchAuditLogs(currentWs.id);
      } catch (err) {
        setError('Failed to load workspace.');
        setLoading(false);
      }
    };
    init();
  }, [workspaceSlug]);

  const fetchAuditLogs = async (wsId: string) => {
    try {
      const res = await api.get(`/workspaces/${wsId}/audit`);
      setLogs(res.data);
    } catch (err) {
      setError('Failed to load activity logs.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className={`min-h-screen ${theme.colors.bg.primary} flex items-center justify-center text-sm text-zinc-500`}>Loading activity...</div>;

  return (
    <div className={`min-h-screen ${theme.colors.bg.primary} ${theme.colors.text.primary} p-8 font-sans`}>
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
          <div className="flex items-center space-x-2">
            <Activity size={18} className="text-zinc-400" />
            <div>
              <h1 className="text-lg font-medium text-white tracking-tight">Activity Log</h1>
              <p className={`text-xs ${theme.colors.text.secondary}`}>Recent actions and events across {workspaceSlug}.</p>
            </div>
          </div>
          <button
            onClick={() => router.push(`/w/${workspaceSlug}`)}
            className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center space-x-1"
          >
            <ArrowLeft size={14} />
            <span>Back to Board</span>
          </button>
        </div>

        <Alert message={error} type="error" />

        {/* Log Listesi */}
        {logs.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-zinc-800 rounded-lg">
            <p className={`text-xs ${theme.colors.text.secondary}`}>No activity recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`p-3 ${theme.colors.bg.secondary} border ${theme.colors.border.primary} rounded-md flex justify-between items-center text-xs`}
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded uppercase">
                      {log.entityType}
                    </span>
                    <span className="font-medium text-white">{log.action}</span>
                  </div>
                  {log.metadata && (
                    <p className="text-[11px] text-zinc-400 font-mono">
                      {JSON.stringify(log.metadata)}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}