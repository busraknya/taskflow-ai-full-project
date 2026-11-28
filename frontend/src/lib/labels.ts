/** Display names shared by the board, task detail and forms (same wording as Android). */
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
};

/** Dot colour per status; the label always accompanies it. */
export const STATUS_DOT: Record<TaskStatus, string> = {
  TODO: 'bg-fg-subtle',
  IN_PROGRESS: 'bg-accent',
  IN_REVIEW: 'bg-warning',
  DONE: 'bg-success',
};

export const NEXT_STATUS: Partial<Record<TaskStatus, TaskStatus>> = {
  TODO: 'IN_PROGRESS',
  IN_PROGRESS: 'IN_REVIEW',
  IN_REVIEW: 'DONE',
};

/** API priority values 0–3. */
export const PRIORITY_LABEL: Record<number, string> = {
  0: 'Normal',
  1: 'Low',
  2: 'Medium',
  3: 'Urgent',
};

export const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};
