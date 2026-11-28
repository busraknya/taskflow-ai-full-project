'use client';

import { useCallback, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getErrorMessage, type ApiErrorBody } from '@/lib/errors';
import { PRIORITY_LABEL, STATUS_LABEL, TASK_STATUSES, type TaskStatus } from '@/lib/labels';
import { describeRisk, RISK_TONE, type RiskModelStatus } from '@/lib/risk';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Select, Textarea } from '@/components/ui/Field';
import { useFeedback } from '@/components/ui/Feedback';
import { PageLoader } from '@/components/ui/Spinner';
import { formatDateTime, formatUtcDate } from '@/lib/format';

interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; fullName: string };
}

interface TaskDetails {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  version: number;
  dueDate: string | null;
  dueDateIsDateOnly?: boolean;
  assignee: { id: string; fullName: string } | null;
  riskAssessments: Array<{ riskLevel: string; riskScore: number | null; factors: Array<{ explanation: string }>; reason?: string | null }>;
}

interface TaskDetailModalProps {
  taskId: string | null;
  workspaceId: string;
  riskModelStatus: RiskModelStatus | null;
  currentUserId: string | null;
  canEdit: boolean;
  canManageAllComments: boolean;
  onClose: () => void;
  /** Called after the task itself changed, so the board can refresh. */
  onChanged: () => void;
}

const errorBody = (err: unknown) => (err as { response?: { data?: ApiErrorBody } }).response?.data;

function formatDue(task: TaskDetails): string {
  if (!task.dueDate) return 'No due date';
  // Date-only due dates are stored as UTC midnight of the calendar date.
  return task.dueDateIsDateOnly
    ? formatUtcDate(task.dueDate)
    : formatDateTime(task.dueDate);
}

export function TaskDetailModal({ taskId, workspaceId, riskModelStatus, currentUserId, canEdit, canManageAllComments, onClose, onChanged }: TaskDetailModalProps) {
  const { toast, confirm } = useFeedback();
  const [task, setTask] = useState<TaskDetails | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const base = `/workspaces/${workspaceId}/tasks/${taskId}`;

  const loadComments = useCallback(async () => {
    const res = await api.get<Comment[]>(`${base}/comments`);
    setComments(res.data);
  }, [base]);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    Promise.allSettled([api.get<TaskDetails>(base), api.get<Comment[]>(`${base}/comments`)]).then(([t, c]) => {
      if (cancelled) return;
      setTask(t.status === 'fulfilled' ? t.value.data : null);
      setLoadError(t.status === 'fulfilled' ? '' : 'This task could not be loaded. It may have been deleted, or you no longer have access.');
      setComments(c.status === 'fulfilled' ? c.value.data : []);
      setLoadedId(taskId);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, base]);

  const changeStatus = async (status: TaskStatus) => {
    if (!task) return;
    setSavingStatus(true);
    try {
      const res = await api.patch<TaskDetails>(base, { status, version: task.version });
      setTask((current) => (current ? { ...current, status: res.data.status, version: res.data.version } : current));
      toast(`Moved to ${STATUS_LABEL[status]}.`);
      onChanged();
    } catch (err) {
      toast(getErrorMessage(errorBody(err)), 'error');
    } finally {
      setSavingStatus(false);
    }
  };

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setPosting(true);
    try {
      await api.post(`${base}/comments`, { body: draft.trim() });
      setDraft('');
      await loadComments();
    } catch (err) {
      toast(getErrorMessage(errorBody(err)), 'error');
    } finally {
      setPosting(false);
    }
  };

  const deleteComment = async (comment: Comment) => {
    const ok = await confirm({ title: 'Delete this comment?', description: 'This cannot be undone.', confirmLabel: 'Delete comment', destructive: true });
    if (!ok) return;
    try {
      await api.delete(`${base}/comments/${comment.id}`);
      toast('Comment deleted.');
      await loadComments();
    } catch (err) {
      toast(getErrorMessage(errorBody(err)), 'error');
    }
  };

  const loading = Boolean(taskId) && loadedId !== taskId;
  const risk = task ? describeRisk(riskModelStatus, task.riskAssessments) : null;
  const factors = risk?.level ? (task?.riskAssessments[0]?.factors ?? []) : [];

  return (
    <Dialog open={taskId !== null} onClose={onClose} variant="sheet" title={loading ? 'Task' : (task?.title ?? 'Task')}>
      {loading ? (
        <PageLoader label="Loading task…" />
      ) : !task ? (
        <p className="text-sm text-fg-muted">{loadError}</p>
      ) : (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-[7rem_1fr] items-center gap-x-4 gap-y-3 text-sm">
            <dt className="text-fg-muted">Status</dt>
            <dd>
              {canEdit ? (
                <div className="w-44">
                  <label htmlFor="task-status" className="sr-only">
                    Status
                  </label>
                  <Select id="task-status" value={task.status} disabled={savingStatus} onChange={(e) => changeStatus(e.target.value as TaskStatus)}>
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </Select>
                </div>
              ) : (
                STATUS_LABEL[task.status]
              )}
            </dd>
            <dt className="text-fg-muted">Priority</dt>
            <dd>
              <Badge tone={task.priority === 3 ? 'danger' : 'neutral'}>{PRIORITY_LABEL[task.priority] ?? `P${task.priority}`}</Badge>
            </dd>
            <dt className="text-fg-muted">Assignee</dt>
            <dd className="flex items-center gap-2">
              {task.assignee ? (
                <>
                  <Avatar name={task.assignee.fullName} size="sm" />
                  {task.assignee.fullName}
                </>
              ) : (
                <span className="text-fg-subtle">Unassigned</span>
              )}
            </dd>
            <dt className="text-fg-muted">Due</dt>
            <dd className={task.dueDate ? 'text-fg' : 'text-fg-subtle'}>{formatDue(task)}</dd>
          </dl>

          <section className="flex flex-col gap-2">
            <h3 className="text-[13px] font-semibold text-fg">Description</h3>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg-muted">{task.description || 'No description.'}</p>
          </section>

          {/* A level only from this workspace's validated model; otherwise an honest state. */}
          {risk && (
            <section className="flex flex-col gap-2 rounded-card border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-fg">Delay risk</h3>
                {risk.level ? (
                  <Badge tone={RISK_TONE[risk.level]}>
                    {risk.title}
                    {risk.probability !== null && ` · ${Math.round(risk.probability * 100)}%`}
                  </Badge>
                ) : (
                  <span className="text-[13px] text-fg-muted">{risk.title}</span>
                )}
              </div>
              {risk.detail && <p className="text-[13px] text-fg-muted">{risk.detail}</p>}
              {factors.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-fg-muted">
                  {factors.map((f, i) => (
                    <li key={i}>{f.explanation}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h3 className="text-[13px] font-semibold text-fg">
              Comments <span className="font-normal text-fg-subtle tabular-nums">{comments.length}</span>
            </h3>
            {comments.length === 0 ? (
              <p className="text-[13px] text-fg-subtle">No comments yet.</p>
            ) : (
              <ul className="flex flex-col gap-4">
                {comments.map((c) => (
                  <li key={c.id} className="group flex gap-3">
                    <Avatar name={c.author.fullName} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-medium text-fg">{c.author.fullName}</span>
                        <time dateTime={c.createdAt} className="text-xs text-fg-subtle">
                          {formatDateTime(c.createdAt)}
                        </time>
                        {(canManageAllComments || c.author.id === currentUserId) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon
                            aria-label="Delete comment"
                            onClick={() => deleteComment(c)}
                            className="ml-auto size-7 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                          >
                            <Trash2 size={14} />
                          </Button>
                        )}
                      </div>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap text-fg">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {canEdit && (
              <form onSubmit={postComment} className="flex flex-col gap-2 pt-1">
                <label htmlFor="new-comment" className="sr-only">
                  Add a comment
                </label>
                <Textarea id="new-comment" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a comment" />
                <div className="flex justify-end">
                  <Button type="submit" variant="primary" size="sm" loading={posting} disabled={!draft.trim()}>
                    Comment
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </Dialog>
  );
}
