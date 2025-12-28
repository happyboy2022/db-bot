/**
 * Executor requests API client
 * 请求级别管理 API 客户端，用于：
 * - 查询请求执行状态
 * - 通过 requestId 终止执行
 * - 预终止请求
 * - 列出当前执行中的请求
 */

import { DEFAULT_DB_TYPE, type DbType } from '@sql-ops/shared';
import { getExecutorConfig, isUsingFallbackConfig } from './config';
import { createSignedHeaders, getSigningSecret } from './signing';

// Fallback configuration for backward compatibility
const FALLBACK_EXECUTOR_URL = process.env.EXECUTOR_BASE_URL || 'http://localhost:8787';
const FALLBACK_SIGNING_SECRET = process.env.EXECUTOR_SIGNING_SECRET || '';

/**
 * 请求状态
 */
export type RequestStatus =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'terminated';

/**
 * 请求信息
 */
export interface RequestInfo {
  requestId: string;
  statementId: string;
  clusterId: string;
  dbType: string;
  code: string;
  processId: number | null;
  status: RequestStatus;
  startedAt: number;
  completedAt: number | null;
  terminatedAt: number | null;
  terminatedBy: string | null;
  terminateReason: string | null;
  error: string | null;
  elapsedMs: number;
}

/**
 * 执行中的请求信息
 */
export interface ExecutingRequest {
  requestId: string;
  statementId: string;
  clusterId: string;
  dbType: string;
  code: string;
  processId: number | null;
  sql: string;
  startedAt: number;
  timeoutMs: number;
  elapsedMs: number;
}

/**
 * 预终止信息
 */
export interface PreTerminateInfo {
  terminatedAt: number;
  reason: string;
  terminatedBy: string;
}

/**
 * 获取请求状态结果
 */
export interface GetRequestStatusResult {
  success: boolean;
  request: RequestInfo | null;
  message?: string;
  error?: string;
  traceId?: string;
}

/**
 * 终止请求结果
 */
export interface TerminateRequestResult {
  success: boolean;
  killed: boolean;
  processId: number | null;
  wasExecuting: boolean;
  message?: string;
  error?: string;
  traceId?: string;
}

/**
 * 预终止请求结果
 */
export interface PreTerminateRequestResult {
  success: boolean;
  message?: string;
  ttlSeconds?: number;
  redirectTo?: string;
  error?: string;
  traceId?: string;
}

/**
 * 检查预终止状态结果
 */
export interface CheckPreTerminateResult {
  success: boolean;
  preTerminate: PreTerminateInfo | null;
  error?: string;
  traceId?: string;
}

/**
 * 列出执行中请求结果
 */
export interface ListExecutingRequestsResult {
  success: boolean;
  requests: ExecutingRequest[];
  count: number;
  filter?: {
    clusterId?: string;
    dbType?: string;
    code?: string;
  };
  error?: string;
  traceId?: string;
}

/**
 * Get executor endpoint configuration
 */
async function getEndpointConfig(
  clusterId?: string
): Promise<{ url: string; signingSecret: string }> {
  if (!clusterId || isUsingFallbackConfig()) {
    return {
      url: FALLBACK_EXECUTOR_URL,
      signingSecret: FALLBACK_SIGNING_SECRET || getSigningSecret(),
    };
  }

  const config = await getExecutorConfig(clusterId);
  return {
    url: config.url,
    signingSecret: config.signingSecret,
  };
}

/**
 * 获取请求执行状态
 */
export async function getRequestExecutionStatus(
  clusterId: string,
  requestId: string,
  traceId?: string
): Promise<GetRequestStatusResult> {
  try {
    const { url, signingSecret } = await getEndpointConfig(clusterId);
    const path = `/api/v1/requests/${requestId}/status`;

    const signedHeaders = createSignedHeaders('GET', path, '', {
      secret: signingSecret,
      traceId,
    });

    const response = await fetch(`${url}${path}`, {
      headers: {
        ...signedHeaders,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Executor request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return {
      ...(result as GetRequestStatusResult),
      traceId: response.headers.get('X-Trace-ID') || signedHeaders['X-Trace-ID'],
    };
  } catch (e) {
    console.error('Failed to get request status:', e);
    return {
      success: false,
      request: null,
      error: e instanceof Error ? e.message : 'Failed to connect to executor',
    };
  }
}

/**
 * 通过 requestId 终止请求执行
 */
export async function terminateRequestExecution(
  clusterId: string,
  requestId: string,
  reason: string,
  terminatedBy: string = 'user',
  traceId?: string
): Promise<TerminateRequestResult> {
  try {
    const { url, signingSecret } = await getEndpointConfig(clusterId);
    const path = `/api/v1/requests/${requestId}/terminate`;

    const body = JSON.stringify({
      reason,
      terminatedBy,
      requestTime: Date.now(),
    });

    const signedHeaders = createSignedHeaders('POST', path, body, {
      secret: signingSecret,
      traceId,
    });

    const response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...signedHeaders,
      },
      body,
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Executor request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return {
      ...(result as TerminateRequestResult),
      traceId: response.headers.get('X-Trace-ID') || signedHeaders['X-Trace-ID'],
    };
  } catch (e) {
    console.error('Failed to terminate request:', e);
    return {
      success: false,
      killed: false,
      processId: null,
      wasExecuting: false,
      error: e instanceof Error ? e.message : 'Failed to connect to executor',
    };
  }
}

/**
 * 预终止请求（请求尚未到达时）
 */
export async function preTerminateRequest(
  clusterId: string,
  requestId: string,
  reason: string,
  terminatedBy: string = 'user',
  traceId?: string
): Promise<PreTerminateRequestResult> {
  try {
    const { url, signingSecret } = await getEndpointConfig(clusterId);
    const path = `/api/v1/requests/${requestId}/pre-terminate`;

    const body = JSON.stringify({
      reason,
      terminatedBy,
      requestTime: Date.now(),
    });

    const signedHeaders = createSignedHeaders('POST', path, body, {
      secret: signingSecret,
      traceId,
    });

    const response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...signedHeaders,
      },
      body,
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Executor request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return {
      ...(result as PreTerminateRequestResult),
      traceId: response.headers.get('X-Trace-ID') || signedHeaders['X-Trace-ID'],
    };
  } catch (e) {
    console.error('Failed to pre-terminate request:', e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to connect to executor',
    };
  }
}

/**
 * 检查预终止状态
 */
export async function checkPreTerminateStatus(
  clusterId: string,
  requestId: string,
  traceId?: string
): Promise<CheckPreTerminateResult> {
  try {
    const { url, signingSecret } = await getEndpointConfig(clusterId);
    const path = `/api/v1/requests/${requestId}/pre-terminate`;

    const signedHeaders = createSignedHeaders('GET', path, '', {
      secret: signingSecret,
      traceId,
    });

    const response = await fetch(`${url}${path}`, {
      headers: {
        ...signedHeaders,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Executor request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return {
      ...(result as CheckPreTerminateResult),
      traceId: response.headers.get('X-Trace-ID') || signedHeaders['X-Trace-ID'],
    };
  } catch (e) {
    console.error('Failed to check pre-terminate status:', e);
    return {
      success: false,
      preTerminate: null,
      error: e instanceof Error ? e.message : 'Failed to connect to executor',
    };
  }
}

/**
 * 列出当前执行中的请求
 */
export async function listExecutingRequests(
  clusterId?: string,
  dbType: DbType = DEFAULT_DB_TYPE,
  code?: string,
  traceId?: string
): Promise<ListExecutingRequestsResult> {
  try {
    const { url, signingSecret } = await getEndpointConfig(clusterId);

    const params = new URLSearchParams();
    if (clusterId) params.set('clusterId', clusterId);
    if (dbType) params.set('dbType', dbType);
    if (code) params.set('code', code);

    const queryString = params.toString();
    const path = `/api/v1/requests/executing${queryString ? `?${queryString}` : ''}`;

    const signedHeaders = createSignedHeaders('GET', path, '', {
      secret: signingSecret,
      traceId,
    });

    const response = await fetch(`${url}${path}`, {
      headers: {
        ...signedHeaders,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Executor request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return {
      ...(result as ListExecutingRequestsResult),
      traceId: response.headers.get('X-Trace-ID') || signedHeaders['X-Trace-ID'],
    };
  } catch (e) {
    console.error('Failed to list executing requests:', e);
    return {
      success: false,
      requests: [],
      count: 0,
      error: e instanceof Error ? e.message : 'Failed to connect to executor',
    };
  }
}
