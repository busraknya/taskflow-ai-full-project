import { effectiveDeadline } from '../task-events/due-date';
import {
  RecordedTaskEvent,
  replayTaskEvents,
  TaskHistoryState,
} from '../task-events/task-history';

/**
 * Everything the feature and label builders may know about a task. Events
 * must belong to this task only; `removedAt` is when the task or its project
 * was deleted (null while it exists).
 */
export interface TimelineTask {
  id: string;
  projectId: string;
  removedAt: Date | null;
  events: readonly RecordedTaskEvent[];
}

/** Events that had happened at `asOf`, in sequence order. */
export function eventsAsOf(
  events: readonly RecordedTaskEvent[],
  asOf: Date,
): RecordedTaskEvent[] {
  const t = asOf.getTime();
  return events
    .filter((event) => event.occurredAt.getTime() <= t)
    .sort((a, b) => Number(a.seq) - Number(b.seq));
}

/** Task state at `asOf`, or null when the task did not exist yet. */
export function stateAsOf(
  events: readonly RecordedTaskEvent[],
  asOf: Date,
): TaskHistoryState | null {
  return replayTaskEvents(eventsAsOf(events, asOf));
}

/**
 * True when the known history starts at creation. Tasks that existed before
 * TaskEvent was introduced start from a SNAPSHOT and are excluded from
 * features and labels: their earlier history is unknown.
 */
export function hasCompleteHistory(
  knownEvents: readonly RecordedTaskEvent[],
): boolean {
  return knownEvents.some((event) => event.type === 'CREATED');
}

export function isRemovedAt(task: TimelineTask, asOf: Date): boolean {
  return task.removedAt !== null && task.removedAt.getTime() <= asOf.getTime();
}

interface WorkSegment {
  taskId: string;
  from: number;
  to: number;
  deadline: number | null;
}

/** Sorted interval endpoints: count of intervals covering t in O(log n). */
class IntervalCounter {
  private readonly starts: number[];
  private readonly ends: number[];

  constructor(intervals: Array<[number, number]>) {
    this.starts = intervals.map(([from]) => from).sort((a, b) => a - b);
    this.ends = intervals.map(([, to]) => to).sort((a, b) => a - b);
  }

  /** Intervals with from <= t < to. */
  coveringCount(t: number): number {
    return upperBound(this.starts, t) - upperBound(this.ends, t);
  }
}

/** Number of values <= t in a sorted array. */
function upperBound(sorted: number[], t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Per-assignee intervals during which a task was open and assigned, used to
 * count an assignee's workload at any point in time without looking ahead.
 * A task is overdue at t when its effective deadline <= t, so its overdue
 * interval is [max(from, deadline), to).
 */
export class WorkloadIndex {
  private readonly segmentsByAssignee = new Map<string, WorkSegment[]>();
  private readonly segmentsByTask = new Map<
    string,
    Array<WorkSegment & { assigneeId: string }>
  >();
  private readonly open = new Map<string, IntervalCounter>();
  private readonly overdue = new Map<string, IntervalCounter>();

  constructor(tasks: readonly TimelineTask[], timeZone: string) {
    for (const task of tasks) {
      const times = [
        ...new Set(task.events.map((e) => e.occurredAt.getTime())),
      ].sort((a, b) => a - b);
      const removed = task.removedAt?.getTime() ?? Infinity;
      for (let i = 0; i < times.length; i += 1) {
        const from = times[i];
        const to = Math.min(times[i + 1] ?? Infinity, removed);
        if (from >= to) continue;
        const state = stateAsOf(task.events, new Date(from));
        if (!state || state.status === 'DONE' || !state.assigneeId) continue;
        const deadline = effectiveDeadline(
          state.dueDate ? new Date(state.dueDate) : null,
          state.dueDateIsDateOnly,
          timeZone,
        );
        const segment = {
          taskId: task.id,
          from,
          to,
          deadline: deadline?.getTime() ?? null,
        };
        const list = this.segmentsByAssignee.get(state.assigneeId) ?? [];
        list.push(segment);
        this.segmentsByAssignee.set(state.assigneeId, list);
        const own = this.segmentsByTask.get(task.id) ?? [];
        own.push({ ...segment, assigneeId: state.assigneeId });
        this.segmentsByTask.set(task.id, own);
      }
    }
    for (const [assigneeId, segments] of this.segmentsByAssignee) {
      this.open.set(
        assigneeId,
        new IntervalCounter(segments.map((s) => [s.from, s.to])),
      );
      this.overdue.set(
        assigneeId,
        new IntervalCounter(
          segments
            .filter((s) => s.deadline !== null && s.deadline < s.to)
            .map((s) => [Math.max(s.from, s.deadline!), s.to]),
        ),
      );
    }
  }

  /** Open tasks assigned to `assigneeId` at `asOf`, excluding one task. */
  workloadAt(
    assigneeId: string,
    asOf: Date,
    excludeTaskId: string,
  ): { open: number; overdue: number } {
    const t = asOf.getTime();
    let open = this.open.get(assigneeId)?.coveringCount(t) ?? 0;
    let overdue = this.overdue.get(assigneeId)?.coveringCount(t) ?? 0;
    // Remove the excluded task's own contribution (at most one segment).
    for (const s of this.segmentsByTask.get(excludeTaskId) ?? []) {
      if (s.assigneeId !== assigneeId || !(s.from <= t && t < s.to)) continue;
      open -= 1;
      if (s.deadline !== null && s.deadline <= t) overdue -= 1;
    }
    return { open, overdue };
  }
}
