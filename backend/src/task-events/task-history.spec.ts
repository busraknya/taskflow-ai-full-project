import {
  diffTaskState,
  RecordedTaskEvent,
  replayTaskEvents,
  TaskHistoryState,
  toEventRows,
  toHistoryState,
} from './task-history';

const base: TaskHistoryState = {
  status: 'TODO',
  priority: 1,
  assigneeId: null,
  dueDate: null,
  dueDateIsDateOnly: false,
  completedAt: null,
  commentCount: 0,
};

let seq = 0;
const event = (
  type: RecordedTaskEvent['type'],
  newValue: unknown,
  at = '2026-11-27T10:00:00.000Z',
): RecordedTaskEvent => ({
  type,
  oldValue: null,
  newValue,
  occurredAt: new Date(at),
  seq: ++seq,
});

describe('toHistoryState', () => {
  it('serialises dates as UTC ISO strings and ignores the flag without a due date', () => {
    expect(
      toHistoryState(
        {
          status: 'DONE',
          priority: 2,
          assigneeId: 'u1',
          dueDate: null,
          dueDateIsDateOnly: true,
          completedAt: new Date('2026-11-27T10:00:00.000Z'),
        },
        3,
      ),
    ).toEqual({
      status: 'DONE',
      priority: 2,
      assigneeId: 'u1',
      dueDate: null,
      dueDateIsDateOnly: false,
      completedAt: '2026-11-27T10:00:00.000Z',
      commentCount: 3,
    });
  });
});

describe('diffTaskState', () => {
  it('returns no events for identical states', () => {
    expect(diffTaskState(base, { ...base })).toEqual([]);
  });

  it('records a due-date event when only the date-only flag changes', () => {
    const before = {
      ...base,
      dueDate: '2026-12-01T00:00:00.000Z',
      dueDateIsDateOnly: true,
    };
    const after = { ...before, dueDateIsDateOnly: false };
    expect(diffTaskState(before, after).map((c) => c.type)).toEqual([
      'DUE_DATE_CHANGED',
    ]);
  });

  it('does not emit events for completedAt or comment count directly', () => {
    expect(
      diffTaskState(base, {
        ...base,
        completedAt: '2026-11-27T10:00:00.000Z',
        commentCount: 4,
      }),
    ).toEqual([]);
  });
});

describe('toEventRows', () => {
  it('marks rows with a client timestamp as OFFLINE_SYNC', () => {
    const [row] = toEventRows(
      [
        {
          type: 'STATUS_CHANGED',
          oldValue: { status: 'TODO' },
          newValue: { status: 'DONE' },
        },
      ],
      {
        workspaceId: 'ws',
        taskId: 't',
        actorId: 'u',
        occurredAt: new Date('2026-11-27T10:00:00.000Z'),
        clientOccurredAt: new Date('2026-11-27T09:00:00.000Z'),
      },
    );
    expect(row).toMatchObject({
      source: 'OFFLINE_SYNC',
      workspaceId: 'ws',
      taskId: 't',
    });
  });
});

describe('replayTaskEvents', () => {
  it('returns null without a CREATED or SNAPSHOT baseline', () => {
    expect(
      replayTaskEvents([event('STATUS_CHANGED', { status: 'DONE' })]),
    ).toBeNull();
  });

  it('applies changes in sequence order, not array order', () => {
    const created = event('CREATED', base);
    const inProgress = event('STATUS_CHANGED', { status: 'IN_PROGRESS' });
    const review = event('STATUS_CHANGED', { status: 'IN_REVIEW' });
    expect(replayTaskEvents([review, created, inProgress])?.status).toBe(
      'IN_REVIEW',
    );
  });

  it('derives completedAt from the last DONE transition and clears it on reopen', () => {
    const state = replayTaskEvents([
      event('CREATED', base, '2026-11-01T09:00:00.000Z'),
      event('STATUS_CHANGED', { status: 'DONE' }, '2026-11-02T09:00:00.000Z'),
      event(
        'STATUS_CHANGED',
        { status: 'IN_PROGRESS' },
        '2026-11-03T09:00:00.000Z',
      ),
    ]);
    expect(state?.completedAt).toBeNull();

    const reDone = replayTaskEvents([
      event('CREATED', base, '2026-11-01T09:00:00.000Z'),
      event('STATUS_CHANGED', { status: 'DONE' }, '2026-11-02T09:00:00.000Z'),
      event(
        'STATUS_CHANGED',
        { status: 'IN_PROGRESS' },
        '2026-11-03T09:00:00.000Z',
      ),
      event('STATUS_CHANGED', { status: 'DONE' }, '2026-11-04T09:00:00.000Z'),
    ]);
    expect(reDone?.completedAt).toBe('2026-11-04T09:00:00.000Z');
  });

  it('applies due date, assignee, priority and comment events', () => {
    const state = replayTaskEvents([
      event('CREATED', base),
      event('DUE_DATE_CHANGED', {
        dueDate: '2026-12-01T00:00:00.000Z',
        dueDateIsDateOnly: true,
      }),
      event('ASSIGNEE_CHANGED', { assigneeId: 'u2' }),
      event('PRIORITY_CHANGED', { priority: 3 }),
      event('COMMENT_ADDED', { commentId: 'c1' }),
      event('COMMENT_ADDED', { commentId: 'c2' }),
      event('COMMENT_DELETED', null),
      event('DUE_DATE_CHANGED', { dueDate: null, dueDateIsDateOnly: false }),
    ]);
    expect(state).toEqual({
      ...base,
      priority: 3,
      assigneeId: 'u2',
      commentCount: 1,
    });
  });

  it('restarts from the latest SNAPSHOT', () => {
    const state = replayTaskEvents([
      event('STATUS_CHANGED', { status: 'IN_PROGRESS' }),
      event('SNAPSHOT', { ...base, status: 'IN_REVIEW', commentCount: 2 }),
      event('COMMENT_ADDED', { commentId: 'c3' }),
    ]);
    expect(state).toMatchObject({ status: 'IN_REVIEW', commentCount: 3 });
  });
});
