import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';
import type { PrismaService } from '../../prisma/prisma.service';

jest.mock('@nestjs/event-emitter', () => ({
  OnEvent: () => () => undefined,
}));
jest.mock('@nestjs/bullmq', () => ({
  InjectQueue: () => () => undefined,
}));

import { TaskAssignedListener } from './task-assigned.listener';

const EMAIL = 'assignee.private@example.com';

describe('TaskAssignedListener logging', () => {
  const queue = { add: jest.fn() };
  const prisma = {
    user: { findUnique: jest.fn() },
    task: { findUnique: jest.fn() },
    notificationPreference: { findUnique: jest.fn() },
  };
  const listener = new TaskAssignedListener(
    queue as unknown as Queue,
    prisma as unknown as PrismaService,
  );
  const payload = {
    taskId: 'task-1',
    assigneeId: 'user-1',
    workspaceId: 'ws-1',
    taskVersion: 2,
  };
  let infoLog: jest.SpyInstance;
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: EMAIL,
      fullName: 'Assignee Name',
    });
    prisma.task.findUnique.mockResolvedValue({ id: 'task-1', title: 'Ship' });
    prisma.notificationPreference.findUnique.mockResolvedValue(null);
    queue.add.mockResolvedValue({});
    infoLog = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  const logged = () =>
    [infoLog, errorLog]
      .flatMap((spy) => spy.mock.calls as unknown[][])
      .flat()
      .map(String)
      .join('\n');

  it('logs the user id, not the e-mail address, when an email is enqueued', async () => {
    await listener.handleTaskAssignedEvent(payload);

    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(logged()).toBe('Task-assigned email enqueued for user user-1.');
  });

  it('logs the user id, not the e-mail address, when email is disabled', async () => {
    prisma.notificationPreference.findUnique.mockResolvedValue({
      emailEnabled: false,
    });

    await listener.handleTaskAssignedEvent(payload);

    expect(queue.add).not.toHaveBeenCalled();
    expect(logged()).toBe(
      'Task-assigned email skipped for user user-1 (disabled in preferences).',
    );
  });

  it('logs a Prisma failure without the query data and does not throw', async () => {
    prisma.notificationPreference.findUnique.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        `Invalid invocation: where: { email: "${EMAIL}" }`,
        { code: 'P1001', clientVersion: 'test' },
      ),
    );

    await expect(
      listener.handleTaskAssignedEvent(payload),
    ).resolves.toBeUndefined();

    expect(logged()).toContain(
      'Failed to handle task.assigned event for task task-1: PrismaClientKnownRequestError (code=P1001)',
    );
    expect(logged()).not.toContain(EMAIL);
    expect(logged()).not.toContain('Invalid invocation');
  });
});
