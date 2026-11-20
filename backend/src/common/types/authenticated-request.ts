import type { WorkspaceMembership } from '@prisma/client';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & {
  user: {
    id: string;
    email: string;
  };
};

export type WorkspaceMemberRequest = AuthenticatedRequest & {
  membership: WorkspaceMembership;
};

export type WorkspaceGuardRequest = Request & {
  user?: Pick<AuthenticatedRequest['user'], 'id'>;
  params: { workspaceId?: string };
  body?: { workspaceId?: string };
  membership?: WorkspaceMembership;
};
