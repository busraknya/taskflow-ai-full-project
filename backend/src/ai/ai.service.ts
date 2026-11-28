import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import {
  FEATURE_SPEC_VERSION,
  FeatureVector,
} from '../risk-features/feature-spec';

export interface RiskPredictionItem {
  taskId: string;
  features: FeatureVector;
}

export interface RiskBatchPrediction {
  modelVersion: string;
  results: Array<{
    taskId: string;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
    /** Calibrated probability of missing the deadline; null if not calibrated. */
    probability: number | null;
  }>;
}

export interface TrainingRowPayload {
  taskId: string;
  projectId: string;
  asOf: string;
  label: 0 | 1;
  features: FeatureVector;
}

export interface TrainingResponse {
  report: {
    decision: 'promoted' | 'rejected';
    modelVersion: string;
    reasons: string[];
    gates: Array<{ name: string; passed: boolean; detail: string }>;
    [key: string]: unknown;
  };
  activeModelVersion: string | null;
}

export interface ModelSummary {
  modelVersion: string;
  createdAt: string;
  calibrated: boolean;
  trainingPeriod: { start: string | null; end: string | null };
  testPeriod: {
    start: string | null;
    end: string | null;
    tasks: number | null;
  };
  prAuc: number | null;
  bestBaseline: string | null;
  baselinePrAuc: number | null;
  improvementOverBaseline: number | null;
}

export interface ModelStatus {
  activeModelVersion: string | null;
  models: ModelSummary[];
}

/** Training can take minutes on large workspaces. */
const TRAINING_TIMEOUT_MS = 30 * 60_000;

/** Maximum items per ML request; the ML service rejects larger batches. */
export const PREDICTION_BATCH_SIZE = 200;

@Injectable()
export class AiService {
  private readonly mlServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // Address of the FastAPI ML service inside Docker (ml-service:8000).
    this.mlServiceUrl =
      this.configService.get<string>('ML_SERVICE_URL') ||
      'http://localhost:8000';
  }

  /**
   * Predictions for tasks of one workspace from that workspace's model, or
   * null when the ML service has no model for it (503 MODEL_UNAVAILABLE). No
   * fallback result is fabricated. Other failures are thrown so the caller
   * can retry.
   */
  async predictBatch(
    workspaceId: string,
    items: RiskPredictionItem[],
  ): Promise<RiskBatchPrediction | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<RiskBatchPrediction>(
          `${this.mlServiceUrl}/predict/batch`,
          { workspaceId, featureSpecVersion: FEATURE_SPEC_VERSION, items },
        ),
      );
      return response.data;
    } catch (error) {
      if (isModelUnavailable(error)) {
        return null;
      }
      throw error;
    }
  }

  /** Trains and evaluates a model on rows of this workspace only. */
  async train(
    workspaceId: string,
    rows: TrainingRowPayload[],
  ): Promise<TrainingResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<TrainingResponse>(
          `${this.mlServiceUrl}/train`,
          { workspaceId, featureSpecVersion: FEATURE_SPEC_VERSION, rows },
          {
            timeout: TRAINING_TIMEOUT_MS,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          },
        ),
      );
      return response.data;
    } catch (error) {
      if (hasDetail(error, 409, 'TRAINING_IN_PROGRESS')) {
        throw new TrainingInProgressError('Another training is running');
      }
      throw error;
    }
  }

  async modelStatus(workspaceId: string): Promise<ModelStatus> {
    const response = await firstValueFrom(
      this.httpService.get<ModelStatus>(
        `${this.mlServiceUrl}/models/${encodeURIComponent(workspaceId)}`,
      ),
    );
    return response.data;
  }

  async rollback(workspaceId: string): Promise<string> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<{ activeModelVersion: string }>(
          `${this.mlServiceUrl}/models/${encodeURIComponent(workspaceId)}/rollback`,
        ),
      );
      return response.data.activeModelVersion;
    } catch (error) {
      if (hasDetail(error, 409, 'NO_EARLIER_MODEL')) {
        throw new NoEarlierModelError('No earlier model to roll back to');
      }
      throw error;
    }
  }

  async deactivate(workspaceId: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(
        `${this.mlServiceUrl}/models/${encodeURIComponent(workspaceId)}/deactivate`,
      ),
    );
  }

  /** Deletes models of workspaces that no longer exist. */
  async prune(keepWorkspaceIds: string[]): Promise<string[]> {
    const response = await firstValueFrom(
      this.httpService.post<{ deletedWorkspaceIds: string[] }>(
        `${this.mlServiceUrl}/models/prune`,
        { keepWorkspaceIds },
      ),
    );
    return response.data.deletedWorkspaceIds;
  }
}

function hasDetail(error: unknown, status: number, detail: string): boolean {
  if (!isAxiosError(error) || error.response?.status !== status) return false;
  const data = error.response.data as { detail?: unknown } | undefined;
  return data?.detail === detail;
}

export class TrainingInProgressError extends Error {}
export class NoEarlierModelError extends Error {}

function isModelUnavailable(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== 503) {
    return false;
  }
  const data = error.response.data as { detail?: unknown } | undefined;
  return data?.detail === 'MODEL_UNAVAILABLE';
}
