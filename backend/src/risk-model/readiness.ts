import type { TrainingRow } from '../risk-features/labels';
import { ReadinessConfig } from './risk-model.config';

const DAY_MS = 86_400_000;

export interface ReadinessCheck {
  name: string;
  value: number;
  required: number;
  passed: boolean;
}

export interface Readiness {
  ready: boolean;
  labelableTasks: number;
  requiredTasks: number;
  checks: ReadinessCheck[];
  config: ReadinessConfig;
  computedAt: string;
}

/**
 * Whether a workspace has enough labelled history to train and evaluate a
 * model. Counts tasks, not snapshots, and mirrors the ML service's split:
 * the test period is the last `testDays` before the latest snapshot.
 */
export function assessReadiness(
  rows: readonly TrainingRow[],
  context: { assignees: number; now: Date },
  config: ReadinessConfig,
): Readiness {
  const tasks = new Map<
    string,
    { labels: number[]; firstAsOf: number; projectId: string }
  >();
  let minAsOf = Infinity;
  let maxAsOf = -Infinity;
  for (const row of rows) {
    const t = row.asOf.getTime();
    minAsOf = Math.min(minAsOf, t);
    maxAsOf = Math.max(maxAsOf, t);
    const task = tasks.get(row.taskId) ?? {
      labels: [],
      firstAsOf: t,
      projectId: row.projectId,
    };
    task.labels.push(row.label);
    task.firstAsOf = Math.min(task.firstAsOf, t);
    tasks.set(row.taskId, task);
  }
  // A task's class is the majority label of its snapshots.
  const classOf = (labels: number[]) =>
    labels.reduce((a, b) => a + b, 0) / labels.length >= 0.5 ? 1 : 0;
  let positive = 0;
  let testTasks = 0;
  let testPositive = 0;
  const testCutoff = maxAsOf - config.testDays * DAY_MS;
  for (const task of tasks.values()) {
    const label = classOf(task.labels);
    positive += label;
    if (task.firstAsOf >= testCutoff) {
      testTasks += 1;
      testPositive += label;
    }
  }
  const total = tasks.size;
  const minority = Math.min(positive, total - positive);
  const projects = new Set([...tasks.values()].map((t) => t.projectId)).size;
  const check = (
    name: string,
    value: number,
    required: number,
  ): ReadinessCheck => ({
    name,
    value: Math.round(value * 1000) / 1000,
    required,
    passed: value >= required,
  });
  const checks = [
    check('labelableTasks', total, config.minTasks),
    check('minorityClassTasks', minority, config.minPerClass),
    check(
      'minorityShare',
      total ? minority / total : 0,
      config.minMinorityShare,
    ),
    check(
      'historyDays',
      total ? (maxAsOf - minAsOf) / DAY_MS : 0,
      config.minSpanDays,
    ),
    check('testPeriodTasks', testTasks, config.minTestTasks),
    check(
      'testPeriodMinorityTasks',
      Math.min(testPositive, testTasks - testPositive),
      config.minTestMinority,
    ),
    check(
      'assigneesOrProjects',
      Math.max(context.assignees, projects),
      config.minGroups,
    ),
  ];
  return {
    ready: checks.every((c) => c.passed),
    labelableTasks: total,
    requiredTasks: config.minTasks,
    checks,
    config,
    computedAt: context.now.toISOString(),
  };
}

/**
 * Scheduled training is due when there was no completed run yet, or when at
 * least `minDaysBetweenRuns` have passed AND labelable tasks grew by
 * `minGrowth` since the last completed run (whichever comes later).
 */
export function isTrainingDue(
  lastCompleted: { createdAt: Date; labelableTasks: number | null } | null,
  labelableTasks: number,
  now: Date,
  schedule: { minDaysBetweenRuns: number; minGrowth: number },
): boolean {
  if (!lastCompleted) return true;
  const days = (now.getTime() - lastCompleted.createdAt.getTime()) / DAY_MS;
  const previous = lastCompleted.labelableTasks ?? 0;
  return (
    days >= schedule.minDaysBetweenRuns &&
    labelableTasks >= previous * (1 + schedule.minGrowth)
  );
}
