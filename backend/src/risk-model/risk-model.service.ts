import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Prisma, WorkspaceRole } from '@prisma/client';
import type { Queue } from 'bullmq';
import { describeError } from '../common/logging/log-sanitizer';
import { PrismaService } from '../prisma/prisma.service';
import { buildTrainingRows, TrainingRow } from '../risk-features/labels';
import { WorkloadIndex } from '../risk-features/timeline';
import {
  loadTimelines,
  TIMELINE_TASK_SELECT,
} from '../risk-features/timeline-loader';
import {
  AiService,
  ModelStatus,
  NoEarlierModelError,
  TrainingInProgressError,
} from '../ai/ai.service';
import { assessReadiness, isTrainingDue, Readiness } from './readiness';
import { readinessConfig, trainingScheduleConfig } from './risk-model.config';
import {
  RISK_MODEL_EVALUATE_JOB,
  RISK_MODEL_QUEUE,
  RISK_MODEL_TRAIN_JOB,
  RiskModelJobData,
} from './risk-model.queue';

const MANAGERS: WorkspaceRole[] = ['OWNER', 'ADMIN'];
const ACTIVE_RUN_STATUSES = ['QUEUED', 'RUNNING'] as const;
const COMPLETED_RUN_STATUSES = ['PROMOTED', 'REJECTED'] as const;

const JOB_OPTIONS = {
  attempts: 1,
  removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
  removeOnFail: { age: 30 * 24 * 3600, count: 1000 },
};

/** Fields of a training run that are safe to show to workspace members. */
function publicRun(
  run: Prisma.RiskModelTrainingGetPayload<object> | null,
): Record<string, unknown> | null {
  if (!run) return null;
  const report = (run.report ?? {}) as {
    reasons?: string[];
    gates?: Array<{ name: string; passed: boolean; detail: string }>;
  };
  return {
    id: run.id,
    status: run.status,
    trigger: run.trigger,
    labelableTasks: run.labelableTasks,
    modelVersion: run.modelVersion,
    reasons: report.reasons ?? [],
    gates: report.gates ?? [],
    error: run.error,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
  };
}

@Injectable()
export class RiskModelService {
  private readonly logger = new Logger(RiskModelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    @InjectQueue(RISK_MODEL_QUEUE)
    private readonly queue: Queue<RiskModelJobData>,
  ) {}

  private assertManager(role: WorkspaceRole) {
    if (!MANAGERS.includes(role)) {
      throw new ForbiddenException(
        'Only workspace owners and admins can manage the risk model.',
      );
    }
  }

  private async workspace(workspaceId: string) {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: {
        id: true,
        timezone: true,
        riskTrainingEnabled: true,
        riskTrainingEnabledAt: true,
        riskReadiness: true,
        riskReadinessAt: true,
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    return workspace;
  }

  // ---------- read ----------

  async getStatus(workspaceId: string) {
    const workspace = await this.workspace(workspaceId);
    const [lastRun, activeRun] = await Promise.all([
      this.prisma.riskModelTraining.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.riskModelTraining.findFirst({
        where: { workspaceId, status: { in: [...ACTIVE_RUN_STATUSES] } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    let models: ModelStatus | null = null;
    let modelServiceAvailable = true;
    try {
      models = await this.ai.modelStatus(workspaceId);
    } catch (error) {
      modelServiceAvailable = false;
      this.logger.warn(
        `Model status unavailable for workspace ${workspaceId}: ${describeError(error).summary}`,
      );
    }
    const active = workspace.riskTrainingEnabled
      ? (models?.models.find(
          (m) => m.modelVersion === models?.activeModelVersion,
        ) ?? null)
      : null;
    return {
      trainingEnabled: workspace.riskTrainingEnabled,
      trainingEnabledAt: workspace.riskTrainingEnabledAt,
      readiness: workspace.riskReadiness,
      readinessComputedAt: workspace.riskReadinessAt,
      modelServiceAvailable,
      activeModel: active,
      trainingInProgress: Boolean(activeRun),
      lastRun: publicRun(lastRun),
    };
  }

  // ---------- manage ----------

  async setTrainingEnabled(
    workspaceId: string,
    role: WorkspaceRole,
    enabled: boolean,
  ) {
    this.assertManager(role);
    const workspace = await this.workspace(workspaceId);
    if (workspace.riskTrainingEnabled !== enabled) {
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          riskTrainingEnabled: enabled,
          riskTrainingEnabledAt: enabled ? new Date() : null,
        },
      });
    }
    if (enabled) {
      // Compute readiness now; trains right away if ready and due.
      await this.queue.add(
        RISK_MODEL_EVALUATE_JOB,
        { workspaceId },
        { ...JOB_OPTIONS, jobId: `evaluate-${workspaceId}-${Date.now()}` },
      );
    } else {
      // Predictions stop immediately (inference checks the opt-in); also
      // deactivate the model so re-enabling never revives an old one.
      try {
        await this.ai.deactivate(workspaceId);
      } catch (error) {
        this.logger.warn(
          `Could not deactivate model of workspace ${workspaceId}: ${describeError(error).summary}`,
        );
      }
    }
    return this.getStatus(workspaceId);
  }

  async requestTraining(
    workspaceId: string,
    role: WorkspaceRole,
    userId: string,
  ) {
    this.assertManager(role);
    const workspace = await this.workspace(workspaceId);
    if (!workspace.riskTrainingEnabled) {
      throw new ConflictException(
        'Enable risk-model training for this workspace first.',
      );
    }
    const active = await this.prisma.riskModelTraining.findFirst({
      where: { workspaceId, status: { in: [...ACTIVE_RUN_STATUSES] } },
    });
    if (active) {
      throw new ConflictException('A training run is already in progress.');
    }
    const run = await this.prisma.riskModelTraining.create({
      data: { workspaceId, trigger: 'MANUAL', requestedById: userId },
    });
    await this.queue.add(
      RISK_MODEL_TRAIN_JOB,
      { workspaceId, runId: run.id },
      { ...JOB_OPTIONS, jobId: `train-${run.id}` },
    );
    return publicRun(run);
  }

  async rollback(workspaceId: string, role: WorkspaceRole) {
    this.assertManager(role);
    const workspace = await this.workspace(workspaceId);
    if (!workspace.riskTrainingEnabled) {
      throw new ConflictException('Risk-model training is disabled.');
    }
    try {
      await this.ai.rollback(workspaceId);
    } catch (error) {
      if (error instanceof NoEarlierModelError) {
        throw new ConflictException('There is no earlier model to restore.');
      }
      throw new ServiceUnavailableException(
        'The risk model service is unavailable.',
      );
    }
    return this.getStatus(workspaceId);
  }

  // ---------- jobs ----------

  /** Labelled rows of this workspace only, plus its readiness. */
  async buildTrainingData(
    workspaceId: string,
    now: Date,
  ): Promise<{ rows: TrainingRow[]; readiness: Readiness }> {
    const workspace = await this.workspace(workspaceId);
    // All tasks, including done and deleted ones: removal before a deadline
    // excludes a task from labels, and workload depends on every task.
    const tasks = await this.prisma.task.findMany({
      where: { workspaceId },
      select: TIMELINE_TASK_SELECT,
    });
    const timelines = [
      ...(await loadTimelines(this.prisma, workspaceId, tasks)).values(),
    ];
    const rows = buildTrainingRows(timelines, {
      observedAt: now,
      timeZone: workspace.timezone,
      workload: new WorkloadIndex(timelines, workspace.timezone),
    });
    const assignees = new Set(tasks.map((t) => t.assigneeId).filter(Boolean))
      .size;
    const readiness = assessReadiness(
      rows,
      { assignees, now },
      readinessConfig(),
    );
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        riskReadiness: readiness as unknown as Prisma.InputJsonValue,
        riskReadinessAt: now,
      },
    });
    return { rows, readiness };
  }

  /** Nightly: readiness for every workspace; trains when enabled, ready and due. */
  async evaluateWorkspace(workspaceId: string, now = new Date()) {
    const { rows, readiness } = await this.buildTrainingData(workspaceId, now);
    const workspace = await this.workspace(workspaceId);
    if (!workspace.riskTrainingEnabled || !readiness.ready) {
      return { trained: false, ready: readiness.ready };
    }
    const lastCompleted = await this.prisma.riskModelTraining.findFirst({
      where: { workspaceId, status: { in: [...COMPLETED_RUN_STATUSES] } },
      orderBy: { createdAt: 'desc' },
    });
    const due = isTrainingDue(
      lastCompleted,
      readiness.labelableTasks,
      now,
      trainingScheduleConfig(),
    );
    const active = await this.prisma.riskModelTraining.findFirst({
      where: { workspaceId, status: { in: [...ACTIVE_RUN_STATUSES] } },
    });
    if (!due || active) return { trained: false, ready: true };
    const run = await this.prisma.riskModelTraining.create({
      data: { workspaceId, trigger: 'SCHEDULED' },
    });
    await this.runTraining(run.id, { rows, readiness });
    return { trained: true, ready: true };
  }

  /** Runs a queued training (manual runs build their data here). */
  async runTraining(
    runId: string,
    data?: { rows: TrainingRow[]; readiness: Readiness },
  ) {
    const run = await this.prisma.riskModelTraining.findUnique({
      where: { id: runId },
    });
    if (!run || run.status !== 'QUEUED') return;
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: run.workspaceId, deletedAt: null },
      select: { riskTrainingEnabled: true },
    });
    const finish = (data: Prisma.RiskModelTrainingUpdateInput) =>
      this.prisma.riskModelTraining.update({
        where: { id: runId },
        data: { ...data, finishedAt: new Date() },
      });
    if (!workspace?.riskTrainingEnabled) {
      await finish({ status: 'FAILED', error: 'Training is disabled.' });
      return;
    }
    await this.prisma.riskModelTraining.update({
      where: { id: runId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    try {
      const { rows, readiness } =
        data ?? (await this.buildTrainingData(run.workspaceId, new Date()));
      const readinessJson = readiness as unknown as Prisma.InputJsonValue;
      if (!readiness.ready) {
        await finish({
          status: 'NOT_READY',
          labelableTasks: readiness.labelableTasks,
          readiness: readinessJson,
        });
        return;
      }
      const result = await this.ai.train(
        run.workspaceId,
        rows.map((row) => ({
          taskId: row.taskId,
          projectId: row.projectId,
          asOf: row.asOf.toISOString(),
          label: row.label,
          features: row.features,
        })),
      );
      const promoted = result.report.decision === 'promoted';
      await finish({
        status: promoted ? 'PROMOTED' : 'REJECTED',
        labelableTasks: readiness.labelableTasks,
        readiness: readinessJson,
        report: result.report as unknown as Prisma.InputJsonValue,
        modelVersion: promoted ? result.report.modelVersion : null,
      });
    } catch (error) {
      const message =
        error instanceof TrainingInProgressError
          ? 'Another training was running on the model service.'
          : 'Training failed; see the backend logs.';
      this.logger.error(
        `Training run ${runId} failed: ${describeError(error).summary}`,
        describeError(error).stack,
      );
      await finish({ status: 'FAILED', error: message });
    }
  }

  /** Daily: readiness for all workspaces and removal of orphaned models. */
  async scheduleAll(runKey: string) {
    const workspaces = await this.prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    try {
      const deleted = await this.ai.prune(workspaces.map((w) => w.id));
      if (deleted.length > 0) {
        this.logger.log(
          `Deleted models of ${deleted.length} removed workspace(s)`,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Model cleanup skipped: ${describeError(error).summary}`,
      );
    }
    await this.queue.addBulk(
      workspaces.map((w) => ({
        name: RISK_MODEL_EVALUATE_JOB,
        data: { workspaceId: w.id },
        opts: { ...JOB_OPTIONS, jobId: `evaluate-${w.id}-${runKey}` },
      })),
    );
    return workspaces.length;
  }
}
