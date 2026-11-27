/** Training runs one at a time, outside request handling. */
export const RISK_MODEL_QUEUE = 'risk-model-training';
/** Daily: readiness for every workspace, scheduled training, model cleanup. */
export const RISK_MODEL_SCHEDULE_JOB = 'schedule-all';
export const RISK_MODEL_EVALUATE_JOB = 'evaluate-workspace';
export const RISK_MODEL_TRAIN_JOB = 'train-workspace';
export const RISK_MODEL_SCHEDULER_ID = 'daily-risk-training';
/** 03:00 UTC, after the 02:00 risk recompute. */
export const RISK_MODEL_CRON = '0 3 * * *';

export interface EvaluateWorkspaceJobData {
  workspaceId: string;
}

export interface TrainWorkspaceJobData {
  workspaceId: string;
  runId: string;
}

export type RiskModelJobData =
  EvaluateWorkspaceJobData | TrainWorkspaceJobData | Record<string, never>;
