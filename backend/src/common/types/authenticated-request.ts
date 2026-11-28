import type { WorkspaceMembership } from '@prisma/client';

export type AuthenticatedRequest = {
  user: {
    id: string;
  };
};

export type WorkspaceMemberRequest = AuthenticatedRequest & {
  membership: Pick<WorkspaceMembership, 'role'>;
};

export type WorkspaceGuardRequest = {
  user?: Pick<AuthenticatedRequest['user'], 'id'>;
  params: { workspaceId?: string };
  body?: { workspaceId?: string };
  membership?: Pick<WorkspaceMembership, 'role'>;
};
