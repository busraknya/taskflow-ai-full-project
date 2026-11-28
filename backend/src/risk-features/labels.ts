import { FeatureVector } from './feature-spec';
import { buildFeatures, eligibilityAt, IneligibleReason } from './features';
import { stateAsOf, TimelineTask, WorkloadIndex } from './timeline';

const DAY_MS = 24 * 3_600_000;

export type LabelResult =
  | { label: 0 | 1; deadline: Date }
  | {
      label: null;
      reason: IneligibleReason | 'censored' | 'removed-before-deadline';
    };

/**
 * Label for a prediction made at `asOf`: 1 when the task was not DONE at the
 * deadline known at `asOf`, 0 when it was. Later deadline changes do not
 * change the label. Returns no label when the outcome was not yet observable
 * at `observedAt` (censored) or the task was removed before its deadline.
 */
export function labelAt(
  task: TimelineTask,
  asOf: Date,
  observedAt: Date,
  timeZone: string,
): LabelResult {
  const eligibility = eligibilityAt(task, asOf, timeZone);
  if (!eligibility.eligible) return { label: null, reason: eligibility.reason };
  const { deadline } = eligibility;

  if (deadline.getTime() > observedAt.getTime()) {
    return { label: null, reason: 'censored' };
  }
  if (task.removedAt && task.removedAt.getTime() <= deadline.getTime()) {
    return { label: null, reason: 'removed-before-deadline' };
  }
  const atDeadline = stateAsOf(task.events, deadline);
  return { label: atDeadline?.status === 'DONE' ? 0 : 1, deadline };
}

export interface TrainingRow {
  taskId: string;
  projectId: string;
  asOf: Date;
  features: FeatureVector;
  label: 0 | 1;
}

/**
 * Labelled snapshots taken every day at 00:00 UTC while a task was eligible.
 * Rows of the same task must stay in the same split when evaluating.
 */
export function buildTrainingRows(
  tasks: readonly TimelineTask[],
  options: { observedAt: Date; timeZone: string; workload: WorkloadIndex },
): TrainingRow[] {
  const rows: TrainingRow[] = [];
  const end = options.observedAt.getTime();
  for (const task of tasks) {
    const created = task.events.find((e) => e.type === 'CREATED');
    if (!created) continue;
    const first = Math.ceil(created.occurredAt.getTime() / DAY_MS) * DAY_MS;
    for (let t = first; t <= end; t += DAY_MS) {
      const asOf = new Date(t);
      const label = labelAt(task, asOf, options.observedAt, options.timeZone);
      if (label.label === null) {
        // Nothing later can be eligible once the task has been removed.
        if (label.reason === 'removed') break;
        continue;
      }
      const result = buildFeatures(task, asOf, options);
      if (!result.ok) continue;
      rows.push({
        taskId: task.id,
        projectId: task.projectId,
        asOf,
        features: result.features,
        label: label.label,
      });
    }
  }
  return rows;
}
