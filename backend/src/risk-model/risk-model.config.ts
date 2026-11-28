/**
 * Readiness and scheduling settings. Defaults are starting hypotheses, not
 * proven requirements; they are configurable and reported with every
 * readiness result. MIN_TEST_TASKS follows the measured power of the
 * promotion gate (ml-service/MODEL_CARD.md): with far fewer test-period
 * tasks a real signal is rarely promoted.
 */
export interface ReadinessConfig {
  minTasks: number;
  minPerClass: number;
  minMinorityShare: number;
  minSpanDays: number;
  testDays: number;
  minTestTasks: number;
  minTestMinority: number;
  minGroups: number;
}

export interface TrainingScheduleConfig {
  minDaysBetweenRuns: number;
  minGrowth: number;
}

const number = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
};

export function readinessConfig(): ReadinessConfig {
  return {
    minTasks: number('RISK_READINESS_MIN_TASKS', 300),
    minPerClass: number('RISK_READINESS_MIN_PER_CLASS', 50),
    minMinorityShare: number('RISK_READINESS_MIN_MINORITY_SHARE', 0.05),
    minSpanDays: number('RISK_READINESS_MIN_SPAN_DAYS', 90),
    testDays: 30, // must match the ML service's evaluation split
    minTestTasks: number('RISK_READINESS_MIN_TEST_TASKS', 250),
    minTestMinority: number('RISK_READINESS_MIN_TEST_MINORITY', 20),
    minGroups: number('RISK_READINESS_MIN_GROUPS', 3),
  };
}

export function trainingScheduleConfig(): TrainingScheduleConfig {
  return {
    minDaysBetweenRuns: number('RISK_TRAINING_MIN_DAYS', 30),
    minGrowth: number('RISK_TRAINING_MIN_GROWTH', 0.2),
  };
}
