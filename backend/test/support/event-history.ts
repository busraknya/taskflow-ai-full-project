/**
 * In-memory TaskEvent histories for unit tests of the feature and label
 * builders. Events are derived with the production diff function so their
 * shape matches what the API writes. Technical test data only.
 */
import {
  diffTaskState,
  RecordedTaskEvent,
  TaskHistoryState,
} from '../../src/task-events/task-history';
import type { TimelineTask } from '../../src/risk-features/timeline';
import { createRandom, generateOperations } from './task-simulator';

let seq = 0;

export type HistoryChange = { at: string | Date } & (
  | { status: string }
  | { dueDate: string | null; dateOnly?: boolean }
  | { assigneeId: string | null }
  | { priority: number }
  | { comment: 'add' | 'delete' }
);

export const BASE_STATE: TaskHistoryState = {
  status: 'TODO',
  priority: 1,
  assigneeId: null,
  dueDate: null,
  dueDateIsDateOnly: false,
  completedAt: null,
  commentCount: 0,
};

/** Events of one task: a CREATED event followed by the given changes. */
export function buildEvents(
  createdAt: string | Date,
  initial: Partial<TaskHistoryState>,
  changes: HistoryChange[] = [],
): RecordedTaskEvent[] {
  const created = new Date(createdAt);
  let state: TaskHistoryState = { ...BASE_STATE, ...initial };
  if (state.status === 'DONE') state.completedAt = created.toISOString();
  const events: RecordedTaskEvent[] = [
    {
      type: 'CREATED',
      oldValue: null,
      newValue: { ...state },
      occurredAt: created,
      seq: ++seq,
    },
  ];
  for (const change of changes) {
    const at = new Date(change.at);
    if ('comment' in change) {
      events.push({
        type: change.comment === 'add' ? 'COMMENT_ADDED' : 'COMMENT_DELETED',
        oldValue: null,
        newValue: change.comment === 'add' ? { commentId: `c${seq}` } : null,
        occurredAt: at,
        seq: ++seq,
      });
      state = {
        ...state,
        commentCount: state.commentCount + (change.comment === 'add' ? 1 : -1),
      };
      continue;
    }
    const next: TaskHistoryState = { ...state };
    if ('status' in change) {
      next.status = change.status;
      if (change.status === 'DONE' && state.status !== 'DONE') {
        next.completedAt = at.toISOString();
      } else if (change.status !== 'DONE') {
        next.completedAt = null;
      }
    }
    if ('dueDate' in change) {
      next.dueDate = change.dueDate
        ? new Date(change.dueDate).toISOString()
        : null;
      next.dueDateIsDateOnly = change.dueDate
        ? Boolean(change.dateOnly)
        : false;
    }
    if ('assigneeId' in change) next.assigneeId = change.assigneeId;
    if ('priority' in change) next.priority = change.priority;
    for (const diff of diffTaskState(state, next)) {
      events.push({ ...diff, occurredAt: at, seq: ++seq });
    }
    state = next;
  }
  return events;
}

export function timelineTask(
  id: string,
  events: RecordedTaskEvent[],
  removedAt: Date | null = null,
  projectId = 'project-1',
): TimelineTask {
  return { id, projectId, removedAt, events };
}

/**
 * Seeded random history for one task: operations from the lifecycle
 * simulator at random gaps of up to two days, starting at `start`.
 */
export function randomEvents(
  seed: number,
  start: Date,
  assignees: string[],
): RecordedTaskEvent[] {
  const random = createRandom(seed * 7919);
  let t = start.getTime();
  const changes: HistoryChange[] = [];
  let comments = 0;
  for (const op of generateOperations(seed, 25, assignees.length)) {
    t += 1 + random.int(48 * 3_600_000);
    const at = new Date(t);
    switch (op.kind) {
      case 'status':
        changes.push({ at, status: op.status });
        break;
      case 'dueDate':
        changes.push({
          at,
          dueDate: op.value,
          dateOnly: op.value !== null && op.value.length === 10,
        });
        break;
      case 'assignee':
        changes.push({
          at,
          assigneeId:
            op.assigneeIndex === null ? null : assignees[op.assigneeIndex],
        });
        break;
      case 'priority':
        changes.push({ at, priority: op.priority });
        break;
      case 'addComment':
        comments += 1;
        changes.push({ at, comment: 'add' });
        break;
      case 'deleteComment':
        if (comments > 0) {
          comments -= 1;
          changes.push({ at, comment: 'delete' });
        }
        break;
      default:
        break;
    }
  }
  return buildEvents(
    start,
    { dueDate: '2026-12-15T00:00:00.000Z', dueDateIsDateOnly: true },
    changes,
  );
}
