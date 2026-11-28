import type { Prisma, TaskEventSource, TaskEventType } from '@prisma/client';

/**
 * Task state as recorded by TaskEvent. Dates are ISO 8601 strings in UTC so
 * events can be stored as JSON and compared exactly.
 */
export interface TaskHistoryState {
  status: string;
  priority: number;
  assigneeId: string | null;
  dueDate: string | null;
  dueDateIsDateOnly: boolean;
  completedAt: string | null;
  commentCount: number;
}

export interface TaskEventChange {
  type: TaskEventType;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}

/** Minimal event shape needed to replay history. */
export interface RecordedTaskEvent {
  type: TaskEventType;
  oldValue: unknown;
  newValue: unknown;
  occurredAt: Date;
  seq: bigint | number;
}

export interface TaskEventContext {
  workspaceId: string;
  taskId: string;
  actorId: string | null;
  occurredAt: Date;
  clientOccurredAt?: Date | null;
}

const iso = (date: Date | null | undefined) =>
  date ? date.toISOString() : null;

/** History state of a task row; comment count is supplied by the caller. */
export function toHistoryState(
  task: {
    status: string;
    priority: number;
    assigneeId: string | null;
    dueDate: Date | null;
    dueDateIsDateOnly: boolean;
    completedAt: Date | null;
  },
  commentCount: number,
): TaskHistoryState {
  return {
    status: task.status,
    priority: task.priority,
    assigneeId: task.assigneeId ?? null,
    dueDate: iso(task.dueDate),
    dueDateIsDateOnly: task.dueDate ? task.dueDateIsDateOnly : false,
    completedAt: iso(task.completedAt),
    commentCount,
  };
}

/** Events describing the difference between two task states. */
export function diffTaskState(
  before: TaskHistoryState,
  after: TaskHistoryState,
): TaskEventChange[] {
  const changes: TaskEventChange[] = [];
  if (before.status !== after.status) {
    changes.push({
      type: 'STATUS_CHANGED',
      oldValue: { status: before.status },
      newValue: { status: after.status },
    });
  }
  if (
    before.dueDate !== after.dueDate ||
    before.dueDateIsDateOnly !== after.dueDateIsDateOnly
  ) {
    changes.push({
      type: 'DUE_DATE_CHANGED',
      oldValue: {
        dueDate: before.dueDate,
        dueDateIsDateOnly: before.dueDateIsDateOnly,
      },
      newValue: {
        dueDate: after.dueDate,
        dueDateIsDateOnly: after.dueDateIsDateOnly,
      },
    });
  }
  if (before.assigneeId !== after.assigneeId) {
    changes.push({
      type: 'ASSIGNEE_CHANGED',
      oldValue: { assigneeId: before.assigneeId },
      newValue: { assigneeId: after.assigneeId },
    });
  }
  if (before.priority !== after.priority) {
    changes.push({
      type: 'PRIORITY_CHANGED',
      oldValue: { priority: before.priority },
      newValue: { priority: after.priority },
    });
  }
  return changes;
}

/** Rows for `prisma.taskEvent.createMany`. */
export function toEventRows(changes: TaskEventChange[], ctx: TaskEventContext) {
  const source: TaskEventSource = ctx.clientOccurredAt ? 'OFFLINE_SYNC' : 'API';
  return changes.map((change) => ({
    workspaceId: ctx.workspaceId,
    taskId: ctx.taskId,
    type: change.type,
    oldValue: (change.oldValue ?? undefined) as
      Prisma.InputJsonValue | undefined,
    newValue: (change.newValue ?? undefined) as
      Prisma.InputJsonValue | undefined,
    occurredAt: ctx.occurredAt,
    clientOccurredAt: ctx.clientOccurredAt ?? null,
    actorId: ctx.actorId,
    source,
  }));
}

/**
 * Rebuilds task state from its events. The baseline is the latest CREATED or
 * SNAPSHOT event; later events are applied in order. Returns null when no
 * baseline exists.
 */
export function replayTaskEvents(
  events: readonly RecordedTaskEvent[],
): TaskHistoryState | null {
  const ordered = [...events].sort((a, b) => Number(a.seq) - Number(b.seq));
  let state: TaskHistoryState | null = null;

  for (const event of ordered) {
    const value = (event.newValue ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'CREATED':
      case 'SNAPSHOT':
        state = { ...(value as unknown as TaskHistoryState) };
        break;
      case 'STATUS_CHANGED':
        if (state) {
          const status = value.status as string;
          if (status === 'DONE' && state.status !== 'DONE') {
            state.completedAt = event.occurredAt.toISOString();
          } else if (status !== 'DONE') {
            state.completedAt = null;
          }
          state.status = status;
        }
        break;
      case 'DUE_DATE_CHANGED':
        if (state) {
          state.dueDate = (value.dueDate as string | null) ?? null;
          state.dueDateIsDateOnly = Boolean(value.dueDateIsDateOnly);
        }
        break;
      case 'ASSIGNEE_CHANGED':
        if (state)
          state.assigneeId = (value.assigneeId as string | null) ?? null;
        break;
      case 'PRIORITY_CHANGED':
        if (state) state.priority = value.priority as number;
        break;
      case 'COMMENT_ADDED':
        if (state) state.commentCount += 1;
        break;
      case 'COMMENT_DELETED':
        if (state) state.commentCount -= 1;
        break;
    }
  }
  return state;
}
