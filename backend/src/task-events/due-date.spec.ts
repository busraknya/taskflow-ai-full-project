import {
  effectiveDeadline,
  isValidTimeZone,
  parseDueDateInput,
} from './due-date';

describe('parseDueDateInput', () => {
  it('treats YYYY-MM-DD as a calendar date stored at UTC midnight', () => {
    expect(parseDueDateInput('2026-12-01')).toEqual({
      dueDate: new Date('2026-12-01T00:00:00.000Z'),
      dueDateIsDateOnly: true,
    });
  });

  it('keeps any value with a time as an exact instant', () => {
    expect(parseDueDateInput('2026-12-01T15:30:00+03:00')).toEqual({
      dueDate: new Date('2026-12-01T12:30:00.000Z'),
      dueDateIsDateOnly: false,
    });
    // An ISO value at midnight is still an explicit time, not a date.
    expect(parseDueDateInput('2026-12-01T00:00:00.000Z')).toEqual({
      dueDate: new Date('2026-12-01T00:00:00.000Z'),
      dueDateIsDateOnly: false,
    });
  });

  it('distinguishes "unchanged" from "cleared"', () => {
    expect(parseDueDateInput(undefined)).toBeUndefined();
    expect(parseDueDateInput(null)).toEqual({
      dueDate: null,
      dueDateIsDateOnly: false,
    });
    expect(parseDueDateInput('')).toEqual({
      dueDate: null,
      dueDateIsDateOnly: false,
    });
  });
});

describe('effectiveDeadline', () => {
  const dateOnly = (value: string) => new Date(`${value}T00:00:00.000Z`);

  it('returns null without a due date', () => {
    expect(effectiveDeadline(null, true, 'UTC')).toBeNull();
  });

  it('returns the exact instant for explicit-time due dates in any zone', () => {
    const instant = new Date('2026-12-01T15:30:00.000Z');
    expect(effectiveDeadline(instant, false, 'Pacific/Auckland')).toEqual(
      instant,
    );
  });

  it.each([
    // End of 1 Dec = start of 2 Dec in the workspace zone.
    ['UTC', '2026-12-01', '2026-12-02T00:00:00.000Z'],
    ['Europe/Istanbul', '2026-12-01', '2026-12-01T21:00:00.000Z'], // UTC+3, no DST
    ['America/Los_Angeles', '2026-12-01', '2026-12-02T08:00:00.000Z'], // PST, UTC-8
    ['Pacific/Auckland', '2026-12-01', '2026-12-01T11:00:00.000Z'], // NZDT, UTC+13
    ['Asia/Kolkata', '2026-06-15', '2026-06-15T18:30:00.000Z'], // UTC+5:30
  ])(
    'ends a date-only due date at local midnight (%s, %s)',
    (zone, date, expected) => {
      expect(effectiveDeadline(dateOnly(date), true, zone)).toEqual(
        new Date(expected),
      );
    },
  );

  it('handles the day before a DST change (New York, spring forward)', () => {
    // 2026-03-08 02:00 EST -> 03:00 EDT. Midnight starting 9 March is EDT.
    expect(
      effectiveDeadline(dateOnly('2026-03-08'), true, 'America/New_York'),
    ).toEqual(new Date('2026-03-09T04:00:00.000Z'));
    // Midnight starting 8 March is still EST.
    expect(
      effectiveDeadline(dateOnly('2026-03-07'), true, 'America/New_York'),
    ).toEqual(new Date('2026-03-08T05:00:00.000Z'));
  });

  it('handles the day of a DST change (New York, fall back)', () => {
    // 2026-11-01 02:00 EDT -> 01:00 EST. Midnight starting 2 Nov is EST.
    expect(
      effectiveDeadline(dateOnly('2026-11-01'), true, 'America/New_York'),
    ).toEqual(new Date('2026-11-02T05:00:00.000Z'));
  });

  it('uses the first instant of the day when local midnight does not exist', () => {
    // Cuba moves clocks from 00:00 to 01:00 in spring; midnight is skipped.
    const deadline = effectiveDeadline(
      dateOnly('2026-03-07'),
      true,
      'America/Havana',
    )!;
    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Havana',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(deadline);
    expect(local.startsWith('2026-03-08')).toBe(true);
    // One millisecond earlier is still on the due date.
    const before = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Havana',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(deadline.getTime() - 1));
    expect(before).toBe('2026-03-07');
  });
});

describe('isValidTimeZone', () => {
  it.each(['UTC', 'Europe/Istanbul', 'America/New_York'])(
    'accepts %s',
    (zone) => {
      expect(isValidTimeZone(zone)).toBe(true);
    },
  );

  it.each(['Mars/Olympus', 'not a zone', ''])('rejects %p', (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });
});
