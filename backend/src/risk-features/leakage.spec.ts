import { readFileSync } from 'fs';
import { join } from 'path';
import { randomEvents, timelineTask } from '../../test/support/event-history';
import { FEATURE_NAMES, FEATURE_SPEC_VERSION } from './feature-spec';
import { buildFeatures } from './features';
import { labelAt } from './labels';
import { effectiveDeadline } from '../task-events/due-date';
import { stateAsOf, TimelineTask, WorkloadIndex } from './timeline';
import { createRandom } from '../../test/support/task-simulator';

/**
 * Leakage tests: anything that happens after the prediction time must not
 * change features, and anything after the observation time must not change
 * labels. Histories are seeded and random (technical test data only).
 */
const ZONES = ['UTC', 'Europe/Istanbul', 'America/New_York'];
const ASSIGNEES = ['u1', 'u2', 'u3'];
const START = new Date('2026-11-01T00:00:00Z');

function workspace(seed: number): TimelineTask[] {
  const random = createRandom(seed);
  return Array.from({ length: 6 }, (_, i) => {
    const start = new Date(START.getTime() + random.int(5 * 24) * 3_600_000);
    const removedAt =
      random.int(5) === 0
        ? new Date(start.getTime() + random.int(40 * 24) * 3_600_000)
        : null;
    return timelineTask(
      `t${seed}-${i}`,
      randomEvents(seed * 10 + i, start, ASSIGNEES),
      removedAt,
    );
  });
}

/** What was knowable at `t`: past events only, removal only if it happened. */
function truncate(tasks: TimelineTask[], t: Date): TimelineTask[] {
  return tasks.map((task) => ({
    ...task,
    removedAt: task.removedAt && task.removedAt <= t ? task.removedAt : null,
    events: task.events.filter((e) => e.occurredAt <= t),
  }));
}

describe('time-travel invariance', () => {
  it('features at t depend only on what was known at t', () => {
    let compared = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const tasks = workspace(seed);
      const random = createRandom(seed + 1_000);
      const timeZone = ZONES[seed % ZONES.length];
      const fullIndex = new WorkloadIndex(tasks, timeZone);
      for (let k = 0; k < 8; k += 1) {
        const asOf = new Date(
          START.getTime() + random.int(60 * 24) * 3_600_000,
        );
        const past = truncate(tasks, asOf);
        const pastIndex = new WorkloadIndex(past, timeZone);
        tasks.forEach((task, i) => {
          const full = buildFeatures(task, asOf, {
            timeZone,
            workload: fullIndex,
          });
          const known = buildFeatures(past[i], asOf, {
            timeZone,
            workload: pastIndex,
          });
          expect(known).toEqual(full);
          if (full.ok) compared += 1;
        });
      }
    }
    // The random histories must actually produce eligible snapshots.
    expect(compared).toBeGreaterThan(300);
  });

  it('labels depend only on what was known at the observation time', () => {
    let labelled = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const tasks = workspace(seed);
      const random = createRandom(seed + 2_000);
      const timeZone = ZONES[seed % ZONES.length];
      for (let k = 0; k < 8; k += 1) {
        const asOf = new Date(
          START.getTime() + random.int(40 * 24) * 3_600_000,
        );
        const observedAt = new Date(
          asOf.getTime() + random.int(40 * 24) * 3_600_000,
        );
        const past = truncate(tasks, observedAt);
        tasks.forEach((task, i) => {
          const full = labelAt(task, asOf, observedAt, timeZone);
          expect(labelAt(past[i], asOf, observedAt, timeZone)).toEqual(full);
          if (full.label !== null) labelled += 1;
        });
      }
    }
    expect(labelled).toBeGreaterThan(100);
  });

  it('produces finite values for exactly the contracted features', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const tasks = workspace(seed);
      const index = new WorkloadIndex(tasks, 'UTC');
      for (const task of tasks) {
        for (let h = 0; h < 50 * 24; h += 13) {
          const result = buildFeatures(
            task,
            new Date(START.getTime() + h * 3_600_000),
            {
              timeZone: 'UTC',
              workload: index,
            },
          );
          if (!result.ok) continue;
          expect(Object.keys(result.features)).toEqual([...FEATURE_NAMES]);
          for (const value of Object.values(result.features)) {
            expect(Number.isFinite(value)).toBe(true);
          }
          expect(result.features.hours_to_deadline).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('WorkloadIndex', () => {
  it('matches a brute-force count from replayed task states', () => {
    let checked = 0;
    for (let seed = 1; seed <= 30; seed += 1) {
      const tasks = workspace(seed);
      const timeZone = ZONES[seed % ZONES.length];
      const index = new WorkloadIndex(tasks, timeZone);
      const random = createRandom(seed + 3_000);
      for (let k = 0; k < 20; k += 1) {
        const t = new Date(START.getTime() + random.int(60 * 24) * 3_600_000);
        const exclude = tasks[random.int(tasks.length)].id;
        for (const assignee of ASSIGNEES) {
          let open = 0;
          let overdue = 0;
          for (const task of tasks) {
            if (task.id === exclude) continue;
            if (task.removedAt && task.removedAt <= t) continue;
            const state = stateAsOf(task.events, t);
            if (
              !state ||
              state.status === 'DONE' ||
              state.assigneeId !== assignee
            )
              continue;
            open += 1;
            const deadline = effectiveDeadline(
              state.dueDate ? new Date(state.dueDate) : null,
              state.dueDateIsDateOnly,
              timeZone,
            );
            if (deadline && deadline <= t) overdue += 1;
          }
          expect(index.workloadAt(assignee, t, exclude)).toEqual({
            open,
            overdue,
          });
          if (open > 0) checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(200);
  });
});

describe('feature contract with the ML service', () => {
  it('matches ml-service/feature_spec.json exactly, in order', () => {
    const spec = JSON.parse(
      readFileSync(
        join(__dirname, '../../../ml-service/feature_spec.json'),
        'utf8',
      ),
    ) as { version: string; features: Array<{ name: string }> };
    expect(spec.version).toBe(FEATURE_SPEC_VERSION);
    expect(spec.features.map((f) => f.name)).toEqual([...FEATURE_NAMES]);
  });
});
