import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosResponse } from 'axios';
import type { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';

// Isolate the ESM-only @nestjs/axios package; only HttpService.post is used.
jest.mock('@nestjs/axios', () => ({ HttpService: class HttpService {} }));

import type { HttpService } from '@nestjs/axios';
import { AiService } from './ai.service';
import {
  FEATURE_NAMES,
  FEATURE_SPEC_VERSION,
  FeatureVector,
} from '../risk-features/feature-spec';

const FEATURES = Object.fromEntries(
  FEATURE_NAMES.map((name) => [name, 1]),
) as FeatureVector;
const ITEMS = [{ taskId: 'task-1', features: FEATURES }];

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

  it('sends the workspace, feature spec version and items to /predict/batch', async () => {
    const prediction = {
      modelVersion: 'ws-model-1',
      results: [{ taskId: 'task-1', riskLevel: 'MEDIUM', probability: null }],
    };
    http.post.mockReturnValue(of({ data: prediction }));

    await expect(service.predictBatch('ws-1', ITEMS)).resolves.toEqual(
      prediction,
    );
    expect(http.post).toHaveBeenCalledWith(
      'http://ml-service:8000/predict/batch',
      {
        workspaceId: 'ws-1',
        featureSpecVersion: FEATURE_SPEC_VERSION,
        items: ITEMS,
      },
    );
  });

  it('returns null, not a fabricated result, when the ML service has no model', async () => {
    http.post.mockReturnValue(
      throwError(() => httpError(503, { detail: 'MODEL_UNAVAILABLE' })),
    );

    await expect(service.predictBatch('ws-1', ITEMS)).resolves.toBeNull();
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

    await expect(service.predictBatch('ws-1', ITEMS)).rejects.toBe(error);
  });
});
