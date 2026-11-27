import type { Queue } from 'bullmq';

/** BullMQ queue that computes task risk outside the request path (O-1). */
export const RISK_ASSESSMENT_QUEUE = 'risk-assessment';
export const RISK_ASSESSMENT_JOB = 'assess-task';
/** Daily: enqueues one recompute job per workspace. */
export const RISK_RECOMPUTE_ALL_JOB = 'recompute-all';
/** Recomputes every open task of one workspace in batches. */
export const RISK_RECOMPUTE_WORKSPACE_JOB = 'recompute-workspace';
export const RISK_RECOMPUTE_SCHEDULER_ID = 'daily-risk-recompute';
/** 02:00 UTC every day. */
export const RISK_RECOMPUTE_CRON = '0 2 * * *';

/**
 * Short delay so rapid successive edits are processed once: each job carries
 * the task version it was created for, and stale versions are skipped.
 */
export const RISK_ASSESSMENT_DELAY_MS = 2_000;

export interface RiskAssessmentJobData {
  taskId: string;
  workspaceId: string;
  taskVersion: number;
}

export interface RiskRecomputeWorkspaceJobData {
  workspaceId: string;
}

export type RiskQueueJobData =
  RiskAssessmentJobData | RiskRecomputeWorkspaceJobData | Record<string, never>;

/** One job per task version; re-adding the same version is a no-op. */
export function riskAssessmentJobId(taskId: string, taskVersion: number) {
  return `task-${taskId}-v${taskVersion}`;
}

/**
 * Adds a single-task assessment job without waiting for it. Failures are
 * passed to `onError` so callers can log them; the request never blocks on
 * Redis or the ML service.
 */
export function enqueueRiskAssessment(
  queue: Queue<RiskQueueJobData>,
  data: RiskAssessmentJobData,
  jobId: string,
  onError: (error: unknown) => void,
): void {
  queue
    .add(RISK_ASSESSMENT_JOB, data, {
      jobId,
      delay: RISK_ASSESSMENT_DELAY_MS,
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 24 * 3600, count: 1000 },
      removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
    })
    .catch(onError);
}

/**
 * Model versions whose stored assessments must not be shown. `v1` was the
 * removed demonstration model trained on six synthetic examples.
 */
export const RETIRED_RISK_MODEL_VERSIONS = ['v1'];

/** Model version recorded on UNAVAILABLE rows that withdraw a prediction. */
export const NO_MODEL_VERSION = 'none';

/**
 * Latest assessment, unless it came from a retired model. When the latest row
 * is UNAVAILABLE (the task is done, overdue, has no due date or no model is
 * available any more) clients show no level instead of an older prediction.
 */
export const CURRENT_RISK_ASSESSMENT_INCLUDE = {
  where: {
    modelVersion: { notIn: RETIRED_RISK_MODEL_VERSIONS },
  },
  orderBy: { computedAt: 'desc' as const },
  take: 1,
};
