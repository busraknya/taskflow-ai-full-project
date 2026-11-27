import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { isAxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

export interface RiskPredictionResult {
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  risk_score: number | null;
  model_version: string;
  factors: Array<{ feature: string; explanation: string }>;
}

export interface RiskFeatures {
  days_until_due: number;
  assignee_active_task_count: number;
  comment_count: number;
  priority: number;
}

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
   * Returns a prediction from a loaded model, or null when the ML service has
   * no model (503 MODEL_UNAVAILABLE). No fallback result is fabricated.
   * Other failures (network, timeouts, unexpected errors) are thrown so the
   * caller can retry; they are logged by the caller.
   */
  async assessTaskRisk(
    features: RiskFeatures,
  ): Promise<RiskPredictionResult | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<RiskPredictionResult>(
          `${this.mlServiceUrl}/predict`,
          features,
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
}

function isModelUnavailable(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== 503) {
    return false;
  }
  const data = error.response.data as { detail?: unknown } | undefined;
  return data?.detail === 'MODEL_UNAVAILABLE';
}
