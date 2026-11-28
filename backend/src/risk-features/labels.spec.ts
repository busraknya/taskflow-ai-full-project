import { buildEvents, timelineTask } from '../../test/support/event-history';
import { buildTrainingRows, labelAt } from './labels';
import { WorkloadIndex } from './timeline';

const UTC = 'UTC';
const at = (iso: string) => new Date(iso);
const CREATED = '2026-11-01T00:00:00Z';
// Explicit deadline: 10 Nov 12:00 UTC.
const DUE = { dueDate: '2026-11-10T12:00:00.000Z', dueDateIsDateOnly: false };
const AS_OF = at('2026-11-05T00:00:00Z');
const OBSERVED = at('2026-12-01T00:00:00Z');

const label = (
  changes: Parameters<typeof buildEvents>[2],
  removedAt: Date | null = null,
) =>
  labelAt(
    timelineTask('t', buildEvents(CREATED, DUE, changes), removedAt),
    AS_OF,
    OBSERVED,
    UTC,
  );

describe('labelAt', () => {
  it('is 0 when the task was DONE at the deadline', () => {
    expect(
      label([{ at: '2026-11-10T11:59:00Z', status: 'DONE' }]),
    ).toMatchObject({ label: 0 });
    // Completion exactly at the deadline counts as on time.
    expect(
      label([{ at: '2026-11-10T12:00:00Z', status: 'DONE' }]),
    ).toMatchObject({ label: 0 });
  });

  it('is 1 when the task was not DONE at the deadline', () => {
    expect(label([])).toMatchObject({ label: 1 });
    expect(
      label([{ at: '2026-11-10T12:00:01Z', status: 'DONE' }]),
    ).toMatchObject({ label: 1 });
    // Done earlier but reopened before the deadline.
    expect(
      label([
        { at: '2026-11-06T00:00:00Z', status: 'DONE' },
        { at: '2026-11-08T00:00:00Z', status: 'IN_PROGRESS' },
      ]),
    ).toMatchObject({ label: 1 });
  });

  it('uses the deadline known at prediction time, not later changes', () => {
    // Postponed after the prediction and finished before the new date: still late.
    expect(
      label([
        { at: '2026-11-09T00:00:00Z', dueDate: '2026-11-20T00:00:00.000Z' },
        { at: '2026-11-15T00:00:00Z', status: 'DONE' },
      ]),
    ).toMatchObject({ label: 1 });
  });

  it('does not label outcomes that were not observable yet', () => {
    expect(
      labelAt(
        timelineTask('t', buildEvents(CREATED, DUE)),
        AS_OF,
        at('2026-11-10T11:00:00Z'),
        UTC,
      ),
    ).toEqual({ label: null, reason: 'censored' });
  });

  it('excludes tasks removed before their deadline', () => {
    expect(label([], at('2026-11-08T00:00:00Z'))).toEqual({
      label: null,
      reason: 'removed-before-deadline',
    });
  });

  it('ends date-only deadlines at midnight in the workspace time zone', () => {
    const events = buildEvents(
      CREATED,
      { dueDate: '2026-11-10T00:00:00.000Z', dueDateIsDateOnly: true },
      [
        // 23:30 on 10 Nov in Istanbul (UTC+3).
        { at: '2026-11-10T20:30:00Z', status: 'DONE' },
      ],
    );
    const task = timelineTask('t', events);
    expect(labelAt(task, AS_OF, OBSERVED, 'Europe/Istanbul')).toMatchObject({
      label: 0,
    });
    // In Los Angeles the same instant is still 10 Nov as well.
    expect(labelAt(task, AS_OF, OBSERVED, 'America/Los_Angeles')).toMatchObject(
      { label: 0 },
    );
    // Finished at 00:30 on 11 Nov in Istanbul: late there.
    const late = timelineTask(
      't',
      buildEvents(
        CREATED,
        { dueDate: '2026-11-10T00:00:00.000Z', dueDateIsDateOnly: true },
        [{ at: '2026-11-10T21:30:00Z', status: 'DONE' }],
      ),
    );
    expect(labelAt(late, AS_OF, OBSERVED, 'Europe/Istanbul')).toMatchObject({
      label: 1,
    });
  });
});

describe('buildTrainingRows', () => {
  it('takes one labelled snapshot per day while the task is eligible', () => {
    const tasks = [
      // Due 10 Nov 12:00, done 7 Nov 06:00: snapshots 2..7 Nov, label 0.
      timelineTask(
        'on-time',
        buildEvents('2026-11-01T08:00:00Z', DUE, [
          { at: '2026-11-07T06:00:00Z', status: 'DONE' },
        ]),
      ),
      // Never done: snapshots 2..10 Nov, label 1.
      timelineTask('late', buildEvents('2026-11-01T08:00:00Z', DUE)),
      // No due date: no rows.
      timelineTask('no-due', buildEvents('2026-11-01T08:00:00Z', {})),
    ];
    const rows = buildTrainingRows(tasks, {
      observedAt: OBSERVED,
      timeZone: UTC,
      workload: new WorkloadIndex(tasks, UTC),
    });
    const summary = (id: string) => {
      const own = rows.filter((r) => r.taskId === id);
      return {
        count: own.length,
        first: own[0]?.asOf.toISOString(),
        last: own[own.length - 1]?.asOf.toISOString(),
        labels: [...new Set(own.map((r) => r.label))],
      };
    };
    expect(summary('on-time')).toEqual({
      count: 6,
      first: '2026-11-02T00:00:00.000Z',
      last: '2026-11-07T00:00:00.000Z',
      labels: [0],
    });
    expect(summary('late')).toEqual({
      count: 9,
      first: '2026-11-02T00:00:00.000Z',
      last: '2026-11-10T00:00:00.000Z',
      labels: [1],
    });
    expect(summary('no-due').count).toBe(0);
    expect(new Set(rows.map((r) => r.projectId))).toEqual(
      new Set(['project-1']),
    );
  });
});
