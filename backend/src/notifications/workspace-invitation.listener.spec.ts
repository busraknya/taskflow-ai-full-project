import { Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';

jest.mock('@nestjs/event-emitter', () => ({
  OnEvent: () => () => undefined,
}));
jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
}));

import { resetEmailWarningForTests } from './mail-transport';
import { WorkspaceInvitationListener } from './workspace-invitation.listener';

const EVENT = {
  invitationId: 'inv-1',
  workspaceId: 'ws-1',
  email: 'new.person@example.com',
  workspaceName: 'Design Team',
  inviterName: 'Ada',
  acceptUrl: 'https://app.example.com/invite#secret-token',
  expiresAt: new Date('2026-12-02T12:00:00.000Z'),
};

describe('WorkspaceInvitationListener', () => {
  const queue = { add: jest.fn().mockResolvedValue({}) };
  const listener = new WorkspaceInvitationListener(queue as unknown as Queue);
  const originalHost = process.env.SMTP_HOST;

  beforeEach(() => {
    jest.clearAllMocks();
    resetEmailWarningForTests();
    process.env.SMTP_HOST = 'smtp.example.com';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.SMTP_HOST = originalHost;
  });

  it('queues one email per issued link and keeps the secret job briefly', async () => {
    await listener.handleInvitationCreated(EVENT);
    expect(queue.add).toHaveBeenCalledWith(
      'send-email',
      {
        recipient: 'new.person@example.com',
        subject: 'You were invited to Design Team on TaskFlow AI',
        templateData: {
          type: 'workspace-invitation',
          inviterName: 'Ada',
          workspaceName: 'Design Team',
          expiresAt: '2026-12-02T12:00:00.000Z',
          acceptUrl: 'https://app.example.com/invite#secret-token',
        },
      },
      {
        jobId: `workspace-invitation-inv-1-${EVENT.expiresAt.getTime()}`,
        removeOnComplete: true,
        removeOnFail: { age: 86_400 },
      },
    );
  });

  it('queues nothing when email delivery is not configured', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    process.env.SMTP_HOST = '';
    await listener.handleInvitationCreated(EVENT);
    await listener.handleInvitationCreated(EVENT);
    expect(queue.add).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1); // warned once per process
  });

  it('does not throw when the queue is unavailable and logs no personal data', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    queue.add.mockRejectedValueOnce(new Error('Redis down'));
    await expect(
      listener.handleInvitationCreated(EVENT),
    ).resolves.toBeUndefined();
    const text = error.mock.calls.flat().map(String).join('\n');
    expect(text).toContain('inv-1');
    expect(text).not.toContain('new.person@example.com');
    expect(text).not.toContain('secret-token');
  });
});
