/**
 * Risk feature contract. The ML service reads the same list from
 * `ml-service/feature_spec.json`; a contract test keeps both identical.
 * Any change to a feature's meaning requires a new version.
 */
export const FEATURE_SPEC_VERSION = 'tf-risk-v1';

export const FEATURE_NAMES = [
  // Time
  'hours_to_deadline',
  'deadline_is_date_only',
  'task_age_hours',
  'deadline_lead_hours',
  // Progress
  'status_todo',
  'status_in_progress',
  'status_in_review',
  'hours_in_status',
  'status_change_count',
  'reopen_count',
  // Due-date behaviour
  'due_date_change_count',
  'postpone_count',
  // Workload
  'has_assignee',
  'assignee_change_count',
  'assignee_open_tasks',
  'assignee_overdue_tasks',
  // Activity
  'comment_count',
  'comments_last_7d',
  'events_last_7d',
  'hours_since_last_event',
  // Task attributes
  'priority',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type FeatureVector = Record<FeatureName, number>;
