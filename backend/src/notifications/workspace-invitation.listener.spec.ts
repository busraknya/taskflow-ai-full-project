import type { Queue } from 'bullmq';

jest.mock('@nestjs/event-emitter', () => ({
  OnEvent: () => () => undefined,
}));
jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
}));

import { WorkspaceInvitationListener } from './workspace-invitation.listener';

describe('WorkspaceInvitationListener', () => {
  const queue = { add: jest.fn().mockResolvedValue({}) };
  const listener = new WorkspaceInvitationListener(queue as unknown as Queue);

  beforeEach(() => jest.clearAllMocks());

  it('queues an invitation email with the workspace inbox link and expiry', async () => {
    const expiresAt = new Date('2026-12-02T12:00:00.000Z');

    await listener.handleWorkspaceInvitation({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      email: 'member@example.com',
      fullName: 'New Member',
      workspaceName: 'Product Team',
      expiresAt,
    });

    expect(queue.add).toHaveBeenCalledWith(
      'send-email',
      expect.objectContaining({
        recipient: 'member@example.com',
        subject: expect.stringContaining('Product Team'),
        templateData: expect.objectContaining({
          type: 'workspace-invitation',
          fullName: 'New Member',
          workspaceName: 'Product Team',
          expiresAt: expiresAt.toISOString(),
          acceptUrl: expect.stringMatching(/\/workspaces$/),
        }),
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('workspace-invitation-workspace-1-user-1'),
      }),
    );
  });

  it('does not throw when the email queue is unavailable', async () => {
    queue.add.mockRejectedValueOnce(new Error('Redis unavailable'));

    await expect(
      listener.handleWorkspaceInvitation({
        workspaceId: 'workspace-1',
        userId: 'user-1',
        email: 'member@example.com',
        fullName: 'New Member',
        workspaceName: 'Product Team',
        expiresAt: new Date('2026-12-02T12:00:00.000Z'),
      }),
    ).resolves.toBeUndefined();
  });
});
