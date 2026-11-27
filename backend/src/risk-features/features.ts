import { effectiveDeadline } from '../task-events/due-date';
import {
  replayTaskEvents,
  TaskHistoryState,
} from '../task-events/task-history';
import { FeatureVector } from './feature-spec';
import {
  eventsAsOf,
  hasCompleteHistory,
  isRemovedAt,
  TimelineTask,
  WorkloadIndex,
} from './timeline';

const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 24 * HOUR_MS;

/** Why no prediction can be made for a task at a given time. */
export type IneligibleReason =
  | 'incomplete-history'
  | 'not-created'
  | 'removed'
  | 'done'
  | 'no-due-date'
  | 'overdue';

export type Eligibility =
  | { eligible: true; state: TaskHistoryState; deadline: Date }
  | { eligible: false; reason: IneligibleReason };

/**
 * Whether a task can be predicted at `asOf`: it has a complete history, exists
 * and is open, and has a due date that has not passed. Overdue tasks are not
 * predicted: whether they are late is already known.
 */
export function eligibilityAt(
  task: TimelineTask,
  asOf: Date,
  timeZone: string,
): Eligibility {
  const known = eventsAsOf(task.events, asOf);
  if (known.length === 0) return { eligible: false, reason: 'not-created' };
  if (!hasCompleteHistory(known)) {
    return { eligible: false, reason: 'incomplete-history' };
  }
  const state = replayTaskEvents(known);
  if (!state) return { eligible: false, reason: 'not-created' };
  if (isRemovedAt(task, asOf)) return { eligible: false, reason: 'removed' };
  if (state.status === 'DONE') return { eligible: false, reason: 'done' };
  const deadline = effectiveDeadline(
    state.dueDate ? new Date(state.dueDate) : null,
    state.dueDateIsDateOnly,
    timeZone,
  );
  if (!deadline) return { eligible: false, reason: 'no-due-date' };
  if (deadline.getTime() <= asOf.getTime()) {
    return { eligible: false, reason: 'overdue' };
  }
  return { eligible: true, state, deadline };
}

export type FeatureResult =
  | { ok: true; features: FeatureVector; deadline: Date }
  | { ok: false; reason: IneligibleReason };

/**
 * Features of a task as known at `asOf`. Only events that had happened by
 * `asOf` are read, so training (historical `asOf`) and live inference
 * (`asOf` = now) produce identical values for the same history.
 */
export function buildFeatures(
  task: TimelineTask,
  asOf: Date,
  context: { timeZone: string; workload: WorkloadIndex },
): FeatureResult {
  const eligibility = eligibilityAt(task, asOf, context.timeZone);
  if (!eligibility.eligible) return { ok: false, reason: eligibility.reason };
  const { state, deadline } = eligibility;

  const now = asOf.getTime();
  const events = eventsAsOf(task.events, asOf);
  const created = events.find((e) => e.type === 'CREATED')!;

  let status: string | null = null;
  let statusSince = created.occurredAt.getTime();
  let statusChangeCount = 0;
  let reopenCount = 0;
  let dueDateChangeCount = 0;
  let postponeCount = 0;
  let dueDateSetAt = created.occurredAt.getTime();
  let assigneeChangeCount = 0;
  let commentsLast7d = 0;
  let eventsLast7d = 0;
  let lastEventAt = created.occurredAt.getTime();

  const deadlineOf = (value: unknown) => {
    const v = (value ?? {}) as {
      dueDate?: string | null;
      dueDateIsDateOnly?: boolean;
    };
    return effectiveDeadline(
      v.dueDate ? new Date(v.dueDate) : null,
      Boolean(v.dueDateIsDateOnly),
      context.timeZone,
    );
  };

  for (const event of events) {
    const at = event.occurredAt.getTime();
    lastEventAt = Math.max(lastEventAt, at);
    if (now - at < WEEK_MS) eventsLast7d += 1;
    const value = (event.newValue ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'CREATED':
        status = value.status as string;
        break;
      case 'STATUS_CHANGED': {
        const next = value.status as string;
        if (status === 'DONE' && next !== 'DONE') reopenCount += 1;
        status = next;
        statusSince = at;
        statusChangeCount += 1;
        break;
      }
      case 'DUE_DATE_CHANGED': {
        dueDateChangeCount += 1;
        dueDateSetAt = at;
        const before = deadlineOf(event.oldValue);
        const after = deadlineOf(event.newValue);
        if (before && after && after.getTime() > before.getTime()) {
          postponeCount += 1;
        }
        break;
      }
      case 'ASSIGNEE_CHANGED':
        assigneeChangeCount += 1;
        break;
      case 'COMMENT_ADDED':
        if (now - at < WEEK_MS) commentsLast7d += 1;
        break;
      default:
        break;
    }
  }

  const workload = state.assigneeId
    ? context.workload.workloadAt(state.assigneeId, asOf, task.id)
    : { open: 0, overdue: 0 };

  const features: FeatureVector = {
    hours_to_deadline: (deadline.getTime() - now) / HOUR_MS,
    deadline_is_date_only: state.dueDateIsDateOnly ? 1 : 0,
    task_age_hours: (now - created.occurredAt.getTime()) / HOUR_MS,
    deadline_lead_hours: (deadline.getTime() - dueDateSetAt) / HOUR_MS,
    status_todo: state.status === 'TODO' ? 1 : 0,
    status_in_progress: state.status === 'IN_PROGRESS' ? 1 : 0,
    status_in_review: state.status === 'IN_REVIEW' ? 1 : 0,
    hours_in_status: (now - statusSince) / HOUR_MS,
    status_change_count: statusChangeCount,
    reopen_count: reopenCount,
    due_date_change_count: dueDateChangeCount,
    postpone_count: postponeCount,
    has_assignee: state.assigneeId ? 1 : 0,
    assignee_change_count: assigneeChangeCount,
    assignee_open_tasks: workload.open,
    assignee_overdue_tasks: workload.overdue,
    comment_count: state.commentCount,
    comments_last_7d: commentsLast7d,
    events_last_7d: eventsLast7d,
    hours_since_last_event: (now - lastEventAt) / HOUR_MS,
    priority: state.priority,
  };
  return { ok: true, features, deadline };
}
