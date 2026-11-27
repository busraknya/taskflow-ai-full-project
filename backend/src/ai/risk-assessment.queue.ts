/** BullMQ queue that computes task risk outside the request path (O-1). */
export const RISK_ASSESSMENT_QUEUE = 'risk-assessment';
export const RISK_ASSESSMENT_JOB = 'assess-task';

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

/** One job per task version; re-adding the same version is a no-op. */
export function riskAssessmentJobId(taskId: string, taskVersion: number) {
  return `task-${taskId}-v${taskVersion}`;
}

/**
 * Model versions whose stored assessments must not be shown. `v1` was the
 * removed demonstration model trained on six synthetic examples.
 */
export const RETIRED_RISK_MODEL_VERSIONS = ['v1'];

/** Latest assessment that came from a model that is still valid. */
export const CURRENT_RISK_ASSESSMENT_INCLUDE = {
  where: {
    riskLevel: { not: 'UNAVAILABLE' as const },
    modelVersion: { notIn: RETIRED_RISK_MODEL_VERSIONS },
  },
  orderBy: { computedAt: 'desc' as const },
  take: 1,
};
