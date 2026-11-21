import type { WorkspaceMembership, WorkspaceRole } from '@prisma/client';
import type { Request } from 'express';

export type AuthenticatedRequest = Omit<Request, 'user'> & {
  user: {
    id: string;
  };
};

export type WorkspaceMemberRequest = AuthenticatedRequest & {
  membership: Pick<WorkspaceMembership, 'role'>;
};

export type WorkspaceGuardRequest = Omit<
  Request,
  'user' | 'params' | 'body'
> & {
  user?: Pick<AuthenticatedRequest['user'], 'id'>;
  params: { workspaceId?: string };
  body?: { workspaceId?: string };
  membership?: Pick<WorkspaceMembership, 'role'>;
};

export type WorkspaceRoleRequest = {
  role: WorkspaceRole;
};
