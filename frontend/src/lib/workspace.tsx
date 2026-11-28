'use client';

import { createContext, useContext } from 'react';

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
}

export interface WorkspaceContextValue {
  workspace: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
  /** Owners and admins manage members, projects and the risk model. */
  canManage: boolean;
  /** Viewers can read but not create or change tasks and comments. */
  canEdit: boolean;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/** The workspace of the current /w/[workspaceSlug] route. */
export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside the workspace layout');
  return value;
}
