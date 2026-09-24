import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

export interface RiskPredictionResult {
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNAVAILABLE';
  risk_score: number;
  model_version: string;
  factors: Array<{ feature: string; explanation: string }>;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly mlServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // FastAPI servisimizin Docker içindeki adresi (ml-service:8000)
    this.mlServiceUrl = this.configService.get<string>('ML_SERVICE_URL') || 'http://localhost:8000';
  }

  async assessTaskRisk(taskData: {
    days_until_due: number;
    assignee_active_task_count: number;
    comment_count: number;
    priority: number;
  }): Promise<RiskPredictionResult> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<RiskPredictionResult>(`${this.mlServiceUrl}/predict`, taskData),
      );
      return response.data;
    } catch (error) {
      // Master Invariant #3: Model çalışmıyorsa "çalışıyormuş gibi" sahte sonuç üretilmez.
      // AI Spec §9: Fail-safe - UNAVAILABLE döner.
      this.logger.error('Failed to communicate with ML service, falling back to UNAVAILABLE', error);
      return {
        risk_level: 'UNAVAILABLE',
        risk_score: 0,
        model_version: 'unknown',
        factors: [],
      };
    }
  }
}