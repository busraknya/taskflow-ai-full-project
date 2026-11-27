'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '@/lib/api';
import type { RiskModelStatus } from '@/lib/risk';

interface RiskModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
  canManage: boolean;
  onStatusChange?: (status: RiskModelStatus) => void;
}

const CHECK_LABELS: Record<string, string> = {
  labelableTasks: 'Tasks with a known outcome',
  minorityClassTasks: 'Tasks in the smaller outcome group',
  minorityShare: 'Share of the smaller outcome group',
  historyDays: 'Days of history',
  testPeriodTasks: 'Tasks in the last 30 days (evaluation period)',
  testPeriodMinorityTasks: 'Smaller outcome group in the evaluation period',
  assigneesOrProjects: 'Assignees or projects',
};

const RUN_LABELS: Record<string, string> = {
  QUEUED: 'Queued',
  RUNNING: 'Running',
  PROMOTED: 'New model activated',
  REJECTED: 'Model did not pass evaluation; previous state kept',
  NOT_READY: 'Not enough history yet',
  FAILED: 'Failed',
};

/** Workspace risk model: readiness, active model and owner/admin controls. */
export function RiskModelModal({ isOpen, onClose, workspaceId, canManage, onStatusChange }: RiskModelModalProps) {
  const [status, setStatus] = useState<RiskModelStatus | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isOpen || !workspaceId) return;
    let cancelled = false;
    api
      .get<RiskModelStatus>(`/workspaces/${workspaceId}/risk-model`)
      .then((res) => {
        if (cancelled) return;
        setStatus(res.data);
        onStatusChange?.(res.data);
        setError('');
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the risk model status.');
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, workspaceId, reloadKey, onStatusChange]);

  const act = async (request: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await request();
      setReloadKey((k) => k + 1);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(message || 'The action failed.');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;
  const model = status?.activeModel;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 space-y-4 text-sm">
        <div className="flex justify-between items-center">
          <h2 className="text-white font-medium">Delay-risk model</h2>
          <button onClick={onClose} aria-label="Close" className="text-zinc-500 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-zinc-400">
          TaskFlow learns delay risk only from this workspace&apos;s own task history, on this server. A model is used
          only after it beats simple baselines on recent tasks it has not seen.
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!status ? (
          <p className="text-xs text-zinc-500">Loading…</p>
        ) : (
          <>
            <section className="space-y-1">
              <h3 className="text-xs uppercase font-mono text-zinc-500">Training</h3>
              <p className="text-xs text-zinc-300">
                {status.trainingEnabled ? 'Enabled' : 'Disabled — no predictions are made for this workspace.'}
              </p>
              {canManage && (
                <div className="flex gap-2 pt-1">
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(() => api.patch(`/workspaces/${workspaceId}/risk-model`, { trainingEnabled: !status.trainingEnabled }))
                    }
                    className="text-xs px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                  >
                    {status.trainingEnabled ? 'Disable training' : 'Enable training'}
                  </button>
                  {status.trainingEnabled && (
                    <button
                      disabled={busy || status.trainingInProgress}
                      onClick={() => act(() => api.post(`/workspaces/${workspaceId}/risk-model/train`))}
                      className="text-xs px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      {status.trainingInProgress ? 'Training…' : 'Train now'}
                    </button>
                  )}
                  {status.trainingEnabled && model && (
                    <button
                      disabled={busy}
                      onClick={() => act(() => api.post(`/workspaces/${workspaceId}/risk-model/rollback`))}
                      className="text-xs px-3 py-1.5 rounded-md bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
                    >
                      Restore previous model
                    </button>
                  )}
                </div>
              )}
            </section>

            <section className="space-y-1">
              <h3 className="text-xs uppercase font-mono text-zinc-500">Data readiness</h3>
              {!status.readiness ? (
                <p className="text-xs text-zinc-500">Not checked yet. Readiness is checked every night and when training is enabled.</p>
              ) : (
                <>
                  <p className="text-xs text-zinc-300">
                    {status.readiness.ready ? 'Enough history to train and evaluate a model.' : 'Collecting data.'}{' '}
                    <span className="text-zinc-500">Checked {new Date(status.readiness.computedAt).toLocaleString()}.</span>
                  </p>
                  <ul className="text-xs space-y-0.5">
                    {status.readiness.checks.map((c) => (
                      <li key={c.name} className="flex justify-between gap-2">
                        <span className={c.passed ? 'text-zinc-400' : 'text-amber-400'}>{CHECK_LABELS[c.name] ?? c.name}</span>
                        <span className="font-mono text-zinc-400">
                          {c.value} / {c.required}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-zinc-500">These thresholds are configurable starting values.</p>
                </>
              )}
            </section>

            <section className="space-y-1">
              <h3 className="text-xs uppercase font-mono text-zinc-500">Active model</h3>
              {!status.modelServiceAvailable && <p className="text-xs text-amber-400">The model service cannot be reached.</p>}
              {model ? (
                <ul className="text-xs text-zinc-400 space-y-0.5">
                  <li>Version: <span className="font-mono">{model.modelVersion}</span></li>
                  <li>
                    Evaluated on {model.testPeriod.tasks ?? '?'} recent tasks it had not seen; PR-AUC{' '}
                    {model.prAuc?.toFixed(2) ?? '?'} vs. baseline {model.baselinePrAuc?.toFixed(2) ?? '?'}.
                  </li>
                  <li>{model.calibrated ? 'Calibrated: probabilities are shown.' : 'Not calibrated: only LOW / MEDIUM / HIGH is shown.'}</li>
                </ul>
              ) : (
                <p className="text-xs text-zinc-500">No validated model for this workspace yet.</p>
              )}
            </section>

            {status.lastRun && (
              <section className="space-y-1">
                <h3 className="text-xs uppercase font-mono text-zinc-500">Last training</h3>
                <p className="text-xs text-zinc-300">
                  {RUN_LABELS[status.lastRun.status] ?? status.lastRun.status}{' '}
                  <span className="text-zinc-500">({new Date(status.lastRun.createdAt).toLocaleString()})</span>
                </p>
                {status.lastRun.gates.filter((g) => !g.passed).map((g) => (
                  <p key={g.name} className="text-[11px] text-zinc-500">
                    {g.name}: {g.detail}
                  </p>
                ))}
                {status.lastRun.error && <p className="text-[11px] text-zinc-500">{status.lastRun.error}</p>}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
