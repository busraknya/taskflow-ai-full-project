'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import type { RiskModelStatus } from '@/lib/risk';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { PageLoader } from '@/components/ui/Spinner';
import { formatDateTime, formatNumber } from '@/lib/format';

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

  const model = status?.activeModel;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      title="Delay-risk model"
      description="Learned only from this workspace's own task history, on this server. A model is used only after it beats simple baselines on recent tasks it has not seen."
      size="lg"
    >
      <div className="flex flex-col gap-6">
        <Alert message={error} />
        {!status ? (
          <PageLoader label="Loading model status…" />
        ) : (
          <>
            <Section title="Training">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-fg-muted">
                  {status.trainingEnabled ? 'On. The model is retrained every night when there is enough history.' : 'Off. No predictions are made for this workspace.'}
                </p>
                <Badge tone={status.trainingEnabled ? 'success' : 'neutral'}>{status.trainingEnabled ? 'On' : 'Off'}</Badge>
              </div>
              {canManage && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant={status.trainingEnabled ? 'secondary' : 'primary'}
                    size="sm"
                    disabled={busy}
                    onClick={() => act(() => api.patch(`/workspaces/${workspaceId}/risk-model`, { trainingEnabled: !status.trainingEnabled }))}
                  >
                    {status.trainingEnabled ? 'Turn off training' : 'Turn on training'}
                  </Button>
                  {status.trainingEnabled && (
                    <Button size="sm" disabled={busy} loading={status.trainingInProgress} onClick={() => act(() => api.post(`/workspaces/${workspaceId}/risk-model/train`))}>
                      {status.trainingInProgress ? 'Training…' : 'Train now'}
                    </Button>
                  )}
                  {status.trainingEnabled && model && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act(() => api.post(`/workspaces/${workspaceId}/risk-model/rollback`))}>
                      Restore previous model
                    </Button>
                  )}
                </div>
              )}
            </Section>

            <Section title="Data readiness">
              {!status.readiness ? (
                <p className="text-sm text-fg-muted">Not checked yet. Readiness is checked every night and when training is turned on.</p>
              ) : (
                <>
                  <p className="text-sm text-fg-muted">
                    {status.readiness.ready ? 'Enough history to train and evaluate a model.' : 'Still collecting history.'}{' '}
                    <span className="text-fg-subtle">Checked {formatDateTime(status.readiness.computedAt)}.</span>
                  </p>
                  <ul className="flex flex-col gap-3 pt-1">
                    {status.readiness.checks.map((c) => (
                      <li key={c.name} className="flex flex-col gap-1.5">
                        <div className="flex justify-between gap-3 text-[13px]">
                          <span className={c.passed ? 'text-fg' : 'text-fg-muted'}>{CHECK_LABELS[c.name] ?? c.name}</span>
                          <span className="text-fg-muted tabular-nums">
                            {formatValue(c.name, c.value)} / {formatValue(c.name, c.required)}
                          </span>
                        </div>
                        <progress
                          value={Math.min(c.value, c.required)}
                          max={c.required || 1}
                          aria-label={CHECK_LABELS[c.name] ?? c.name}
                          className={cn(
                            'h-1.5 w-full appearance-none overflow-hidden rounded-full',
                            '[&::-webkit-progress-bar]:bg-subtle [&::-webkit-progress-value]:rounded-full',
                            c.passed ? '[&::-moz-progress-bar]:bg-success [&::-webkit-progress-value]:bg-success' : '[&::-moz-progress-bar]:bg-accent [&::-webkit-progress-value]:bg-accent',
                          )}
                        />
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-fg-subtle">These thresholds are configurable starting values, not proven minimums.</p>
                </>
              )}
            </Section>

            <Section title="Active model">
              {!status.modelServiceAvailable && <Alert message="The model service cannot be reached right now." />}
              {model ? (
                <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-[13px]">
                  <dt className="text-fg-muted">Version</dt>
                  <dd className="font-mono text-fg">{model.modelVersion}</dd>
                  <dt className="text-fg-muted">Evaluation</dt>
                  <dd className="text-fg">
                    {model.testPeriod.tasks ?? '?'} recent unseen tasks · PR-AUC {model.prAuc?.toFixed(2) ?? '?'} vs. baseline {model.baselinePrAuc?.toFixed(2) ?? '?'}
                  </dd>
                  <dt className="text-fg-muted">Probabilities</dt>
                  <dd className="text-fg">{model.calibrated ? 'Shown (model is calibrated)' : 'Hidden; only Low / Medium / High is shown'}</dd>
                </dl>
              ) : (
                <p className="text-sm text-fg-muted">No validated model for this workspace yet.</p>
              )}
            </Section>

            {status.lastRun && (
              <Section title="Last training run">
                <p className="text-sm text-fg">
                  {RUN_LABELS[status.lastRun.status] ?? status.lastRun.status}{' '}
                  <span className="text-fg-subtle">· {formatDateTime(status.lastRun.createdAt)}</span>
                </p>
                {status.lastRun.gates
                  .filter((g) => !g.passed)
                  .map((g) => (
                    <p key={g.name} className="text-[13px] text-fg-muted">
                      {g.name}: {g.detail}
                    </p>
                  ))}
                {status.lastRun.error && <p className="text-[13px] text-fg-muted">{status.lastRun.error}</p>}
              </Section>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

/** Shares are fractions (0.05 = 5%); every other check is a count. */
const formatValue = (name: string, n: number) => (name === 'minorityShare' ? `${Math.round(n * 100)}%` : formatNumber(n));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}
