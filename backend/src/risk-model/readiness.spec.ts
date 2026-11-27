import type { TrainingRow } from '../risk-features/labels';
import { assessReadiness, isTrainingDue } from './readiness';
import { ReadinessConfig } from './risk-model.config';

const CONFIG: ReadinessConfig = {
  minTasks: 10,
  minPerClass: 3,
  minMinorityShare: 0.05,
  minSpanDays: 20,
  testDays: 30,
  minTestTasks: 4,
  minTestMinority: 1,
  minGroups: 2,
};
const DAY = 86_400_000;
const bit = (value: boolean): 0 | 1 => (value ? 1 : 0);
const END = new Date('2026-11-01T00:00:00Z').getTime();

function rows(
  spec: Array<{
    id: string;
    day: number;
    label: 0 | 1;
    snapshots?: number;
    project?: string;
  }>,
): TrainingRow[] {
  return spec.flatMap((t) =>
    Array.from({ length: t.snapshots ?? 3 }, (_, k) => ({
      taskId: t.id,
      projectId: t.project ?? 'p1',
      asOf: new Date(END - (t.day - k) * DAY),
      features: {} as TrainingRow['features'],
      label: t.label,
    })),
  );
}

const check = (r: ReturnType<typeof assessReadiness>, name: string) =>
  r.checks.find((c) => c.name === name)!;

describe('assessReadiness', () => {
  it('counts tasks, not snapshots, and mirrors the test-period split', () => {
    const data = rows([
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `old${i}`,
        day: 100 - i,
        label: bit(i % 3 === 0),
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `new${i}`,
        day: 10 + i,
        label: bit(i === 0),
      })),
    ]);
    const result = assessReadiness(
      data,
      { assignees: 1, now: new Date(END) },
      CONFIG,
    );
    expect(result.labelableTasks).toBe(13);
    expect(check(result, 'minorityClassTasks').value).toBe(4);
    expect(check(result, 'testPeriodTasks').value).toBe(5);
    expect(check(result, 'testPeriodMinorityTasks').value).toBe(1);
    expect(check(result, 'historyDays').value).toBe(92); // oldest snapshot day 100, latest day 8
    expect(result.ready).toBe(false); // only one project and one assignee
    expect(check(result, 'assigneesOrProjects').passed).toBe(false);

    const twoAssignees = assessReadiness(
      data,
      { assignees: 2, now: new Date(END) },
      CONFIG,
    );
    expect(twoAssignees.ready).toBe(true);
  });

  it('is not ready without data', () => {
    const result = assessReadiness(
      [],
      { assignees: 0, now: new Date(END) },
      CONFIG,
    );
    expect(result.ready).toBe(false);
    expect(result.labelableTasks).toBe(0);
    expect(result.checks.every((c) => Number.isFinite(c.value))).toBe(true);
  });
});

describe('isTrainingDue', () => {
  const schedule = { minDaysBetweenRuns: 30, minGrowth: 0.2 };
  const now = new Date('2026-11-27T00:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);

  it('is due without an earlier completed run', () => {
    expect(isTrainingDue(null, 300, now, schedule)).toBe(true);
  });

  it('needs both a month and 20% more labelled tasks', () => {
    expect(
      isTrainingDue(
        { createdAt: daysAgo(31), labelableTasks: 300 },
        359,
        now,
        schedule,
      ),
    ).toBe(false);
    expect(
      isTrainingDue(
        { createdAt: daysAgo(10), labelableTasks: 300 },
        500,
        now,
        schedule,
      ),
    ).toBe(false);
    expect(
      isTrainingDue(
        { createdAt: daysAgo(31), labelableTasks: 300 },
        360,
        now,
        schedule,
      ),
    ).toBe(true);
  });
});
