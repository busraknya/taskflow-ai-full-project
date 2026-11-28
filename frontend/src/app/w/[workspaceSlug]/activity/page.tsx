'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { ROLE_LABEL, STATUS_LABEL, type TaskStatus } from '@/lib/labels';
import type { Member } from '@/lib/tasks';
import { useWorkspace } from '@/lib/workspace';
import { PageHeader } from '@/components/layout/AppShell';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageLoader } from '@/components/ui/Spinner';
import { formatDay, formatTime } from '@/lib/format';

interface AuditLog {
  id: string;
  actorId: string;
  entityType: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface AuditPage {
  items: AuditLog[];
  nextCursor: string | null;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** A sentence for an audit entry, read after the actor's name. */
function describe(log: AuditLog): string {
  const m = log.metadata ?? {};
  switch (log.action) {
    case 'TASK_CREATED':
      return `created the task “${text(m.title)}”`;
    case 'TASK_UPDATED': {
      const status = STATUS_LABEL[text(m.status) as TaskStatus];
      return `updated the task “${text(m.title)}”${status ? ` (now ${status.toLowerCase()})` : ''}`;
    }
    case 'COMMENT_CREATED':
      return `commented “${text(m.bodySnippet)}${text(m.bodySnippet).length >= 30 ? '…' : ''}”`;
    case 'INVITATION_CREATED':
      return `invited someone as ${(ROLE_LABEL[text(m.role)] ?? 'member').toLowerCase()}`;
    case 'INVITATION_REVOKED':
      return 'revoked an invitation';
    case 'INVITATION_ACCEPTED':
      return `joined as ${(ROLE_LABEL[text(m.role)] ?? 'member').toLowerCase()}`;
    default:
      return log.action.toLowerCase().replace(/_/g, ' ');
  }
}

export default function ActivityPage() {
  const { workspace } = useWorkspace();
  const [logs, setLogs] = useState<AuditLog[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  /** Newest first; each call appends the page that follows `cursor`. */
  const load = useCallback(
    (cursor?: string) =>
      api.get<AuditPage>(`/workspaces/${workspace.id}/audit`, { params: { cursor } }).then(
        (res) => {
          setLogs((prev) => (cursor && prev ? [...prev, ...res.data.items] : res.data.items));
          setNextCursor(res.data.nextCursor);
        },
        () => {
          setLogs((prev) => prev ?? []);
          setError('Activity could not be loaded. Check your connection and reload the page.');
        },
      ),
    [workspace.id],
  );

  useEffect(() => {
    void load();
    api
      .get<Member[]>(`/workspaces/${workspace.id}/members`)
      .then((res) => setNames(Object.fromEntries(res.data.map((m) => [m.user.id, m.user.fullName ?? m.user.email]))))
      .catch(() => setNames({}));
  }, [workspace.id, load]);

  const groups = useMemo(() => {
    const byDay: Array<{ day: string; items: AuditLog[] }> = [];
    for (const log of logs ?? []) {
      const day = formatDay(log.createdAt);
      const last = byDay[byDay.length - 1];
      if (last?.day === day) last.items.push(log);
      else byDay.push({ day, items: [log] });
    }
    return byDay;
  }, [logs]);

  return (
    <>
      <PageHeader title="Activity" description={`Recent changes in ${workspace.name}, newest first.`} />
      <div className="flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
        <Alert message={error} />
        {logs === null ? (
          <PageLoader label="Loading activity…" />
        ) : logs.length === 0 ? (
          <EmptyState title="No activity yet" description="Changes to tasks, comments and invitations will appear here." />
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.day} aria-label={group.day} className="flex flex-col gap-2">
                <h2 className="text-[13px] font-semibold text-fg">{group.day}</h2>
                <ol className="divide-y divide-line rounded-card border border-line bg-surface">
                  {group.items.map((log) => {
                    const actor = names[log.actorId] ?? 'A former member';
                    return (
                      <li key={log.id} className="flex items-start gap-3 px-4 py-3">
                        <Avatar name={actor} size="sm" className="mt-0.5" />
                        <p className="min-w-0 flex-1 text-sm text-fg-muted">
                          <span className="font-medium text-fg">{actor}</span> {describe(log)}
                        </p>
                        <time dateTime={log.createdAt} className="shrink-0 pt-0.5 text-xs text-fg-subtle tabular-nums">
                          {formatTime(log.createdAt)}
                        </time>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
            {nextCursor && (
              <Button
                className="self-center"
                loading={loadingMore}
                onClick={async () => {
                  setLoadingMore(true);
                  await load(nextCursor);
                  setLoadingMore(false);
                }}
              >
                Show older activity
              </Button>
            )}
          </>
        )}
      </div>
    </>
  );
}
