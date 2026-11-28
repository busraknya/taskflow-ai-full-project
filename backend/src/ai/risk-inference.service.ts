import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FEATURE_SPEC_VERSION } from '../risk-features/feature-spec';
import { buildFeatures } from '../risk-features/features';
import { WorkloadIndex } from '../risk-features/timeline';
import {
  loadTimelines,
  TIMELINE_TASK_SELECT as TASK_SELECT,
  TimelineTaskRow as SelectedTask,
} from '../risk-features/timeline-loader';
import {
  AiService,
  PREDICTION_BATCH_SIZE,
  RiskPredictionItem,
} from './ai.service';
import {
  NO_MODEL_VERSION,
  RETIRED_RISK_MODEL_VERSIONS,
} from './risk-assessment.queue';

const MODEL_LEVELS = new Set(['LOW', 'MEDIUM', 'HIGH']);

export interface RiskAssessmentSummary {
  candidates: number;
  predicted: number;
  /** Tasks that could not be predicted, by reason. */
  ineligible: Record<string, number>;
  modelUnavailable: boolean;
  /** Earlier predictions withdrawn with an UNAVAILABLE row. */
  withdrawn: number;
}

/**
 * Live risk inference. Features come from the same as-of builder that
 * produces training data, evaluated at the current time; every query is
 * scoped to one workspace.
 */
@Injectable()
export class RiskInferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  /**
   * Assesses the given tasks, or every open task of the workspace when
   * `taskIds` is omitted, and stores the results.
   */
  async assess(
    workspaceId: string,
    taskIds?: string[],
    now: Date = new Date(),
  ): Promise<RiskAssessmentSummary> {
    const summary: RiskAssessmentSummary = {
      candidates: 0,
      predicted: 0,
      ineligible: {},
      modelUnavailable: false,
      withdrawn: 0,
    };
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { timezone: true, riskTrainingEnabled: true },
    });
    if (!workspace) return summary;
    // Without the owner/admin opt-in no model is used for this workspace,
    // whatever the ML service holds.
    const modelAllowed = workspace.riskTrainingEnabled;

    const candidates = await this.prisma.task.findMany({
      where: taskIds
        ? { workspaceId, deletedAt: null, id: { in: taskIds } }
        : {
            workspaceId,
            deletedAt: null,
            status: { not: 'DONE' },
            project: { deletedAt: null },
          },
      select: TASK_SELECT,
    });
    summary.candidates = candidates.length;
    if (candidates.length === 0) return summary;

    // Workload at `now` only involves tasks that are open and assigned to
    // the same people right now, so those are the only other tasks needed.
    const assigneeIds = [
      ...new Set(candidates.map((t) => t.assigneeId).filter(Boolean)),
    ] as string[];
    const colleagues = assigneeIds.length
      ? await this.prisma.task.findMany({
          where: {
            workspaceId,
            deletedAt: null,
            status: { not: 'DONE' },
            assigneeId: { in: assigneeIds },
            project: { deletedAt: null },
          },
          select: TASK_SELECT,
        })
      : [];

    const tasks = new Map<string, SelectedTask>();
    for (const task of [...candidates, ...colleagues]) tasks.set(task.id, task);
    const timelines = await loadTimelines(this.prisma, workspaceId, [
      ...tasks.values(),
    ]);
    const workload = new WorkloadIndex(
      [...timelines.values()],
      workspace.timezone,
    );

    const items: RiskPredictionItem[] = [];
    const reasons = new Map<string, string>();
    for (const task of candidates) {
      const result = buildFeatures(timelines.get(task.id)!, now, {
        timeZone: workspace.timezone,
        workload,
      });
      if (result.ok) {
        items.push({ taskId: task.id, features: result.features });
      } else {
        reasons.set(task.id, result.reason);
        summary.ineligible[result.reason] =
          (summary.ineligible[result.reason] ?? 0) + 1;
      }
    }

    const rows: Prisma.RiskAssessmentCreateManyInput[] = [];
    const predicted = new Set<string>();
    const featuresById = new Map(items.map((i) => [i.taskId, i.features]));
    if (!modelAllowed && items.length > 0) summary.modelUnavailable = true;
    for (
      let i = 0;
      modelAllowed && i < items.length;
      i += PREDICTION_BATCH_SIZE
    ) {
      const batch = await this.aiService.predictBatch(
        workspaceId,
        items.slice(i, i + PREDICTION_BATCH_SIZE),
      );
      if (!batch) {
        summary.modelUnavailable = true;
        break;
      }
      for (const result of batch.results) {
        const features = featuresById.get(result.taskId);
        if (!features || !MODEL_LEVELS.has(result.riskLevel)) continue;
        predicted.add(result.taskId);
        rows.push({
          taskId: result.taskId,
          riskLevel: result.riskLevel,
          riskScore: result.probability,
          factors: [],
          modelVersion: batch.modelVersion,
          featureSpecVersion: FEATURE_SPEC_VERSION,
          featureSnapshot: features,
        });
      }
    }
    summary.predicted = predicted.size;

    // Withdraw earlier predictions that no longer apply so clients never show
    // a stale level (e.g. the task became overdue or the model was removed).
    const unpredicted = candidates
      .map((t) => t.id)
      .filter((id) => !predicted.has(id));
    if (unpredicted.length > 0) {
      const latest = await this.prisma.riskAssessment.findMany({
        where: {
          taskId: { in: unpredicted },
          modelVersion: { notIn: RETIRED_RISK_MODEL_VERSIONS },
        },
        orderBy: [{ taskId: 'asc' }, { computedAt: 'desc' }],
        distinct: ['taskId'],
        select: { taskId: true, riskLevel: true },
      });
      for (const assessment of latest) {
        if (!MODEL_LEVELS.has(assessment.riskLevel)) continue;
        rows.push({
          taskId: assessment.taskId,
          riskLevel: 'UNAVAILABLE',
          riskScore: null,
          factors: [],
          modelVersion: NO_MODEL_VERSION,
          featureSpecVersion: FEATURE_SPEC_VERSION,
          reason:
            reasons.get(assessment.taskId) ??
            (modelAllowed ? 'model-unavailable' : 'training-disabled'),
        });
        summary.withdrawn += 1;
      }
    }

    if (rows.length > 0) {
      await this.prisma.riskAssessment.createMany({ data: rows });
    }
    return summary;
  }
}
