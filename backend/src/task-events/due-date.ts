/**
 * Due-date semantics (approved ML architecture):
 * - A due date with an explicit time is an exact instant.
 * - A date-only due date is a calendar date; it ends at midnight at the end of
 *   that date in the workspace time zone.
 * - Timestamps are stored in UTC. A date-only due date is stored as UTC
 *   midnight of the calendar date, so the stored value never depends on the
 *   workspace time zone.
 */

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ParsedDueDate {
  dueDate: Date | null;
  dueDateIsDateOnly: boolean;
}

/**
 * Interprets API input: `YYYY-MM-DD` is a calendar date; any other ISO 8601
 * value is an exact instant. `null` or `''` clears the due date and
 * `undefined` leaves it unchanged.
 */
export function parseDueDateInput(
  input: string | null | undefined,
): ParsedDueDate | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (input === null || input === '') {
    return { dueDate: null, dueDateIsDateOnly: false };
  }
  const dateOnly = DATE_ONLY.exec(input);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return {
      dueDate: new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))),
      dueDateIsDateOnly: true,
    };
  }
  return { dueDate: new Date(input), dueDateIsDateOnly: false };
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * The instant at which a task becomes overdue. For a date-only due date this
 * is the start of the following calendar day in `timeZone` (exclusive end of
 * the due date). Returns null when the task has no due date.
 */
export function effectiveDeadline(
  dueDate: Date | null,
  dueDateIsDateOnly: boolean,
  timeZone: string,
): Date | null {
  if (!dueDate) {
    return null;
  }
  if (!dueDateIsDateOnly) {
    return dueDate;
  }
  return zonedMidnightToUtc(
    dueDate.getUTCFullYear(),
    dueDate.getUTCMonth(),
    dueDate.getUTCDate() + 1,
    timeZone,
  );
}

/** UTC instant of local midnight on the given calendar day in `timeZone`. */
function zonedMidnightToUtc(
  year: number,
  monthIndex: number,
  day: number,
  timeZone: string,
): Date {
  const wallClock = Date.UTC(year, monthIndex, day);
  // Offsets can differ on either side of a DST change; refine twice.
  let utc = wallClock - offsetMs(wallClock, timeZone);
  utc = wallClock - offsetMs(utc, timeZone);
  // If local midnight does not exist (DST gap at 00:00), the result lands
  // before the requested day; move to the first instant of that day.
  const local = localParts(utc, timeZone);
  if (Date.UTC(local.year, local.month, local.day) < wallClock) {
    utc += 60 * 60 * 1000;
  }
  return new Date(utc);
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function offsetMs(instant: number, timeZone: string): number {
  const p = localParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

function localParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month') - 1,
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}
