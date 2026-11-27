import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosResponse } from 'axios';
import type { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';

// Isolate the ESM-only @nestjs/axios package; only HttpService.post is used.
jest.mock('@nestjs/axios', () => ({ HttpService: class HttpService {} }));

import type { HttpService } from '@nestjs/axios';
import { AiService } from './ai.service';

const FEATURES = {
  days_until_due: 1,
  assignee_active_task_count: 4,
  comment_count: 0,
  priority: 3,
};

function httpError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  const response = {
    status,
    statusText: '',
    headers: {},
    config,
    data,
  } as AxiosResponse;
  return new AxiosError(
    'Request failed',
    'ERR_BAD_RESPONSE',
    config,
    null,
    response,
  );
}

describe('AiService', () => {
  const http = { post: jest.fn() };
  const config = { get: jest.fn().mockReturnValue('http://ml-service:8000') };
  const service = new AiService(
    http as unknown as HttpService,
    config as unknown as ConfigService,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns the prediction of a loaded model', async () => {
    const prediction = {
      risk_level: 'MEDIUM',
      risk_score: null,
      model_version: 'ws-model-1',
      factors: [],
    };
    http.post.mockReturnValue(of({ data: prediction }));

    await expect(service.assessTaskRisk(FEATURES)).resolves.toEqual(prediction);
    expect(http.post).toHaveBeenCalledWith(
      'http://ml-service:8000/predict',
      FEATURES,
    );
  });

  it('returns null, not a fabricated result, when the ML service has no model', async () => {
    http.post.mockReturnValue(
      throwError(() => httpError(503, { detail: 'MODEL_UNAVAILABLE' })),
    );

    await expect(service.assessTaskRisk(FEATURES)).resolves.toBeNull();
  });

  it.each([
    ['another 503 response', httpError(503, { detail: 'OVERLOADED' })],
    ['a 500 response', httpError(500, { detail: 'boom' })],
    [
      'a connection error',
      Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
      }),
    ],
  ])('rethrows %s so the caller can retry', async (_label, error) => {
    http.post.mockReturnValue(throwError(() => error));

    await expect(service.assessTaskRisk(FEATURES)).rejects.toBe(error);
  });
});
