jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => class MockAuthGuard {},
}));

jest.mock('../workspaces/guards/workspace-member.guard', () => ({
  WorkspaceMemberGuard: class MockWorkspaceMemberGuard {},
}));

import { ForbiddenException } from '@nestjs/common';
import { WorkspaceRole } from '@prisma/client';
import { CommentsController } from './comments.controller';
import type { CommentsService } from './comments.service';

describe('CommentsController write permissions', () => {
  const commentsService = {
    create: jest.fn().mockResolvedValue({ id: 'comment-1' }),
  };
  const controller = new CommentsController(
    commentsService as unknown as CommentsService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rejects comment creation by VIEWER members', async () => {
    await expect(
      controller.create(
        'workspace-1',
        'task-1',
        {
          user: { id: 'viewer-1' },
          membership: { role: WorkspaceRole.VIEWER },
        },
        { body: 'A comment' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(commentsService.create).not.toHaveBeenCalled();
  });

  it('allows comment creation by MEMBER users', async () => {
    await expect(
      controller.create(
        'workspace-1',
        'task-1',
        {
          user: { id: 'member-1' },
          membership: { role: WorkspaceRole.MEMBER },
        },
        { body: 'A comment' },
      ),
    ).resolves.toEqual({ id: 'comment-1' });

    expect(commentsService.create).toHaveBeenCalledWith(
      'workspace-1',
      'task-1',
      'member-1',
      { body: 'A comment' },
    );
  });
});
