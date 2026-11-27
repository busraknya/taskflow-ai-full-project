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

export function riskBadgeClass(level: RiskLevel): string {
  switch (level) {
    case 'HIGH':
      return 'bg-red-950 text-red-400 border border-red-900';
    case 'MEDIUM':
      return 'bg-amber-950 text-amber-400 border border-amber-900';
    default:
      return 'bg-zinc-800 text-zinc-400';
  }
}
