import { formatUtcDate } from './format';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

const RISK_LEVELS: readonly string[] = ['LOW', 'MEDIUM', 'HIGH'];

/**
 * Explains why no risk level is shown. TaskFlow ships without a predictive
 * model; a level only appears once a model trained on this workspace's own
 * history has passed evaluation.
 */
export const RISK_UNAVAILABLE_TITLE = 'Risk prediction not available yet';
export const RISK_UNAVAILABLE_DETAIL =
  "TaskFlow shows a delay-risk level only after a model trained on this workspace's task history has passed evaluation.";

/**
 * The risk level of the latest assessment, or null when there is no
 * assessment from a model. Unknown values are never shown as a level.
 */
export function currentRiskLevel(
  assessments?: ReadonlyArray<{ riskLevel: string }> | null,
): RiskLevel | null {
  const level = assessments?.[0]?.riskLevel;
  return level && RISK_LEVELS.includes(level) ? (level as RiskLevel) : null;
}

/** Badge tone per level; LOW stays neutral so only real risk draws attention. */
export const RISK_TONE: Record<RiskLevel, 'neutral' | 'warning' | 'danger'> = {
  LOW: 'neutral',
  MEDIUM: 'warning',
  HIGH: 'danger',
};

// ---------- Workspace risk model (ML stage 4) ----------

export interface ReadinessCheck {
  name: string;
  value: number;
  required: number;
  passed: boolean;
}

export interface RiskModelStatus {
  trainingEnabled: boolean;
  trainingEnabledAt: string | null;
  readiness: {
    ready: boolean;
    labelableTasks: number;
    requiredTasks: number;
    checks: ReadinessCheck[];
    computedAt: string;
  } | null;
  readinessComputedAt: string | null;
  modelServiceAvailable: boolean;
  activeModel: {
    modelVersion: string;
    createdAt: string;
    calibrated: boolean;
    trainingPeriod: { start: string | null; end: string | null };
    testPeriod: { start: string | null; end: string | null; tasks: number | null };
    prAuc: number | null;
    baselinePrAuc: number | null;
    improvementOverBaseline: number | null;
  } | null;
  trainingInProgress: boolean;
  lastRun: {
    status: 'QUEUED' | 'RUNNING' | 'PROMOTED' | 'REJECTED' | 'NOT_READY' | 'FAILED';
    trigger: 'SCHEDULED' | 'MANUAL';
    reasons: string[];
    gates: Array<{ name: string; passed: boolean; detail: string }>;
    error: string | null;
    createdAt: string;
    finishedAt: string | null;
  } | null;
}

export interface RiskAssessmentLike {
  riskLevel: string;
  riskScore?: number | null;
  reason?: string | null;
}

export interface RiskView {
  level: RiskLevel | null;
  title: string;
  detail: string;
  /** Shown only for calibrated models. */
  probability: number | null;
}

const REASON_TEXT: Record<string, string> = {
  'no-due-date': 'This task has no due date, so there is nothing to predict.',
  overdue: 'The due date has passed; the task is already late.',
  done: 'The task is done.',
  removed: 'The task was removed.',
  'incomplete-history': 'This task was created before task history was recorded.',
  'training-disabled': 'Risk predictions are turned off for this workspace.',
  'model-unavailable': 'No validated model is available right now.',
};

const formatDate = (iso: string | null) => (iso ? formatUtcDate(iso) : '?');

/**
 * The delay-risk state to show for a task (architecture §12). A level is shown
 * only when it came from this workspace's validated model; otherwise an honest
 * state explains why there is none.
 */
export function describeRisk(
  status: RiskModelStatus | null,
  assessments?: ReadonlyArray<RiskAssessmentLike> | null,
): RiskView {
  const latest = assessments?.[0];
  const level = currentRiskLevel(assessments);
  const none = (title: string, detail: string): RiskView => ({ level: null, title, detail, probability: null });

  if (!status) {
    return level
      ? { level, title: level, detail: '', probability: null }
      : none(RISK_UNAVAILABLE_TITLE, RISK_UNAVAILABLE_DETAIL);
  }
  if (!status.trainingEnabled) {
    return none(
      'No validated model for this workspace yet',
      'Risk predictions are off. An owner or admin can enable training on this workspace\'s own task history.',
    );
  }
  if (!status.modelServiceAvailable && !level) {
    return none('Prediction not available right now', 'The risk prediction service cannot be reached.');
  }
  if (!status.activeModel) {
    const readiness = status.readiness;
    if (!readiness || !readiness.ready) {
      return none(
        'Collecting data for risk prediction',
        readiness
          ? `Labelled tasks: ${readiness.labelableTasks} / ${readiness.requiredTasks}.`
          : 'Readiness is checked every night.',
      );
    }
    return none(
      'No validated model for this workspace yet',
      status.lastRun?.status === 'REJECTED'
        ? 'The last trained model did not pass evaluation, so it is not used.'
        : 'Enough history is available; a model will be trained and evaluated.',
    );
  }
  if (!level) {
    return none('No prediction for this task', REASON_TEXT[latest?.reason ?? ''] ?? 'A prediction has not been computed yet.');
  }
  const model = status.activeModel;
  const improvement =
    model.improvementOverBaseline !== null ? ` PR-AUC +${model.improvementOverBaseline.toFixed(2)} over the baseline on unseen recent tasks.` : '';
  return {
    level,
    title: model.calibrated ? level : `${level} · low confidence`,
    detail:
      `Model trained on this workspace's tasks (${formatDate(model.trainingPeriod.start)} – ${formatDate(model.trainingPeriod.end)}).` +
      improvement +
      (model.calibrated ? '' : ' Probabilities are not shown because the model is not calibrated.'),
    probability: model.calibrated && typeof latest?.riskScore === 'number' ? latest.riskScore : null,
  };
}
