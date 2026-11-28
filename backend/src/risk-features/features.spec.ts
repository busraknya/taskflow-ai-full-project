import { buildEvents, timelineTask } from '../../test/support/event-history';
import { FEATURE_NAMES } from './feature-spec';
import { buildFeatures, eligibilityAt } from './features';
import { WorkloadIndex } from './timeline';

const UTC = 'UTC';
const at = (iso: string) => new Date(iso);
const noWorkload = new WorkloadIndex([], UTC);

describe('eligibilityAt', () => {
  const due = { dueDate: '2026-12-10T00:00:00.000Z', dueDateIsDateOnly: true };

  it('requires a history captured from creation', () => {
    const task = timelineTask('t', [
      {
        type: 'SNAPSHOT',
        oldValue: null,
        newValue: {
          status: 'TODO',
          priority: 1,
          assigneeId: null,
          ...due,
          completedAt: null,
          commentCount: 0,
        },
        occurredAt: at('2026-11-01T00:00:00Z'),
        seq: 1,
      },
    ]);
    expect(eligibilityAt(task, at('2026-11-05T00:00:00Z'), UTC)).toEqual({
      eligible: false,
      reason: 'incomplete-history',
    });
  });

  it.each([
    ['not-created', '2026-10-31T00:00:00Z', {}, null],
    ['removed', '2026-11-05T00:00:00Z', {}, at('2026-11-04T00:00:00Z')],
    ['no-due-date', '2026-11-05T00:00:00Z', { dueDate: null }, null],
    ['done', '2026-11-05T00:00:00Z', { status: 'DONE' }, null],
    // Date-only due date 10 Dec ends at 11 Dec 00:00 UTC.
    ['overdue', '2026-12-11T00:00:00Z', {}, null],
  ])('reports %s', (reason, asOf, initial, removedAt) => {
    const task = timelineTask(
      't',
      buildEvents('2026-11-01T00:00:00Z', { ...due, ...initial }),
      removedAt,
    );
    expect(eligibilityAt(task, at(asOf), UTC)).toEqual({
      eligible: false,
      reason,
    });
  });

  it('is eligible until the end of a date-only due date', () => {
    const task = timelineTask('t', buildEvents('2026-11-01T00:00:00Z', due));
    expect(eligibilityAt(task, at('2026-12-10T23:59:59Z'), UTC).eligible).toBe(
      true,
    );
    // The same calendar date ends three hours earlier in Istanbul.
    expect(
      eligibilityAt(task, at('2026-12-10T21:00:00Z'), 'Europe/Istanbul'),
    ).toEqual({ eligible: false, reason: 'overdue' });
  });
});

describe('buildFeatures', () => {
  it('computes every feature from history known at prediction time', () => {
    const events = buildEvents(
      '2026-11-01T00:00:00Z',
      {
        priority: 2,
        dueDate: '2026-11-20T00:00:00.000Z',
        dueDateIsDateOnly: true,
      },
      [
        { at: '2026-11-02T00:00:00Z', assigneeId: 'u1' },
        { at: '2026-11-03T00:00:00Z', status: 'IN_PROGRESS' },
        { at: '2026-11-04T00:00:00Z', status: 'DONE' },
        { at: '2026-11-05T00:00:00Z', status: 'IN_PROGRESS' }, // reopened
        { at: '2026-11-06T00:00:00Z', dueDate: '2026-11-25', dateOnly: true }, // postponed
        { at: '2026-11-08T00:00:00Z', comment: 'add' },
        { at: '2026-11-09T00:00:00Z', comment: 'add' },
        { at: '2026-11-09T12:00:00Z', comment: 'delete' },
      ],
    );
    const result = buildFeatures(
      timelineTask('t', events),
      at('2026-11-10T00:00:00Z'),
      {
        timeZone: UTC,
        workload: noWorkload,
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.features)).toEqual([...FEATURE_NAMES]);
    expect(result.features).toEqual({
      hours_to_deadline: 16 * 24, // deadline 26 Nov 00:00 UTC
      deadline_is_date_only: 1,
      task_age_hours: 9 * 24,
      deadline_lead_hours: 20 * 24, // set 6 Nov, due end of 25 Nov
      status_todo: 0,
      status_in_progress: 1,
      status_in_review: 0,
      hours_in_status: 5 * 24,
      status_change_count: 3,
      reopen_count: 1,
      due_date_change_count: 1,
      postpone_count: 1,
      has_assignee: 1,
      assignee_change_count: 1,
      assignee_open_tasks: 0,
      assignee_overdue_tasks: 0,
      comment_count: 1,
      comments_last_7d: 2,
      events_last_7d: 6, // 4–9 Nov; the 3 Nov change is exactly 7 days old
      hours_since_last_event: 12,
      priority: 2,
    });
  });

  it('counts an assignee workload as it was at prediction time', () => {
    const tz = UTC;
    const due = (d: string) => ({
      dueDate: `${d}T00:00:00.000Z`,
      dueDateIsDateOnly: true,
    });
    const tasks = [
      timelineTask(
        'target',
        buildEvents('2026-11-01T00:00:00Z', {
          assigneeId: 'u1',
          ...due('2026-12-01'),
        }),
      ),
      // Open and assigned: counted.
      timelineTask(
        'a',
        buildEvents('2026-11-01T00:00:00Z', {
          assigneeId: 'u1',
          ...due('2026-12-01'),
        }),
      ),
      // Overdue on 10 Nov: counted as open and overdue.
      timelineTask(
        'b',
        buildEvents('2026-11-01T00:00:00Z', {
          assigneeId: 'u1',
          ...due('2026-11-05'),
        }),
      ),
      // Done before 10 Nov: not counted.
      timelineTask(
        'c',
        buildEvents('2026-11-01T00:00:00Z', { assigneeId: 'u1' }, [
          { at: '2026-11-03T00:00:00Z', status: 'DONE' },
        ]),
      ),
      // Reassigned to u1 only after 10 Nov: not counted.
      timelineTask(
        'd',
        buildEvents('2026-11-01T00:00:00Z', { assigneeId: 'u2' }, [
          { at: '2026-11-12T00:00:00Z', assigneeId: 'u1' },
        ]),
      ),
      // Project deleted on 8 Nov: not counted.
      timelineTask(
        'e',
        buildEvents('2026-11-01T00:00:00Z', { assigneeId: 'u1' }),
        at('2026-11-08T00:00:00Z'),
      ),
      // Created after 10 Nov: not counted.
      timelineTask(
        'f',
        buildEvents('2026-11-11T00:00:00Z', { assigneeId: 'u1' }),
      ),
    ];
    const result = buildFeatures(tasks[0], at('2026-11-10T00:00:00Z'), {
      timeZone: tz,
      workload: new WorkloadIndex(tasks, tz),
    });
    expect(result.ok && result.features.assignee_open_tasks).toBe(2);
    expect(result.ok && result.features.assignee_overdue_tasks).toBe(1);
  });
});
