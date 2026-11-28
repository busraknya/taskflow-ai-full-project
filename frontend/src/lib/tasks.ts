import type { TaskStatus } from './labels';

export interface BoardTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  version: number;
  assignee?: { id: string; fullName: string } | null;
  riskAssessments?: Array<{ riskLevel: string }>;
}

/** One keyset page of a board column; nextCursor is null on the last page. */
export interface ColumnPage {
  items: BoardTask[];
  nextCursor: string | null;
}

export interface Project {
  id: string;
  name: string;
}

export interface Member {
  id: string;
  role: string;
  status: string;
  user: { id: string; fullName: string | null; email: string };
}
