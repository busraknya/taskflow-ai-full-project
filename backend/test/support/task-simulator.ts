/**
 * Deterministic task-lifecycle simulator (ML stage 1, technical validation).
 *
 * Generates reproducible sequences of task operations from a seed. The
 * sequences exercise TaskEvent capture and replay; they carry no predictive
 * signal and must never be used as evidence of model quality.
 */

export type SimulatedOperation =
  | { kind: 'status'; status: SimulatedStatus }
  | { kind: 'dueDate'; value: string | null }
  | { kind: 'assignee'; assigneeIndex: number | null }
  | { kind: 'priority'; priority: number }
  | { kind: 'title'; title: string }
  | { kind: 'addComment'; body: string }
  | { kind: 'deleteComment' };

export type SimulatedStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';

const STATUSES: SimulatedStatus[] = [
  'TODO',
  'IN_PROGRESS',
  'IN_REVIEW',
  'DONE',
];

/** mulberry32: small, fast, reproducible PRNG. */
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    pick: <T>(items: readonly T[]): T =>
      items[Math.floor(next() * items.length)],
  };
}

/**
 * A sequence of operations for one task. Covers reopening, status reversals,
 * date-only and explicit-time due dates, clearing due dates, reassignment and
 * unassignment, priority changes, untracked edits and comment churn.
 */
export function generateOperations(
  seed: number,
  length: number,
  assigneeCount: number,
): SimulatedOperation[] {
  const random = createRandom(seed);
  const operations: SimulatedOperation[] = [];
  for (let i = 0; i < length; i += 1) {
    const roll = random.int(100);
    if (roll < 30) {
      operations.push({ kind: 'status', status: random.pick(STATUSES) });
    } else if (roll < 45) {
      const day = String(1 + random.int(28)).padStart(2, '0');
      const choice = random.int(3);
      operations.push({
        kind: 'dueDate',
        value:
          choice === 0
            ? null
            : choice === 1
              ? `2026-12-${day}`
              : `2026-12-${day}T${String(random.int(24)).padStart(2, '0')}:30:00.000Z`,
      });
    } else if (roll < 58) {
      operations.push({
        kind: 'assignee',
        assigneeIndex: random.int(4) === 0 ? null : random.int(assigneeCount),
      });
    } else if (roll < 68) {
      operations.push({ kind: 'priority', priority: random.int(4) });
    } else if (roll < 75) {
      operations.push({ kind: 'title', title: `Renamed ${seed}-${i}` });
    } else if (roll < 90) {
      operations.push({ kind: 'addComment', body: `Comment ${seed}-${i}` });
    } else {
      operations.push({ kind: 'deleteComment' });
    }
  }
  return operations;
}
