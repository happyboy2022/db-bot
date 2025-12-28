/**
 * Executor API client for SQL execution
 * Handles communication with cluster-specific Executor services
 * Implements HMAC-SHA256 signing with timestamp and nonce for replay protection
 */

import { getExecutorConfig, isUsingFallbackConfig } from './config';
import { createSignedHeaders, getSigningSecret } from './signing';

/**
 * Execute request parameters
 */
export interface ExecuteParams {
  requestId: string;
  version: number;
  statementId: string;
  clusterId: string;
  dbType: string;
  code: string;
  sql: string;
  timeoutMs?: number;
  /** 可选的 trace ID，用于跨服务追踪 */
  traceId?: string;
}

/**
 * Execute response from executor
 */
export interface ExecuteResult {
  success: boolean;
  statementId: string;
  /** MySQL 进程 ID，用于终止执行 */
  processId: number | null;
  affectedRows: number | null;
  resultRowCount: number | null;
  resultPreview: {
    columns: string[];
    rows: Record<string, unknown>[];
    truncated: boolean;
  } | null;
  durationMs: number;
  errorMessage: string | null;
  /** 响应中返回的 trace ID */
  traceId?: string;
}

/**
 * Precheck request parameters
 */
export interface PrecheckParams {
  clusterId: string;
  dbType: string;
  code: string;
  sql: string;
  /** 可选的 trace ID */
  traceId?: string;
}

/**
 * Precheck response from executor
 */
export interface PrecheckResult {
  success: boolean;
  affectedRows: number | null;
  errorMessage: string | null;
  /** 响应中返回的 trace ID */
  traceId?: string;
}

/**
 * Default timeout in milliseconds
 */
const DEFAULT_TIMEOUT_MS = 30000;

// Fallback configuration for backward compatibility
const FALLBACK_EXECUTOR_URL = process.env.EXECUTOR_BASE_URL || 'http://localhost:8787';
const FALLBACK_SIGNING_SECRET = process.env.EXECUTOR_SIGNING_SECRET || '';

/**
 * Get executor endpoint configuration
 * Uses cluster-specific config or falls back to environment variables
 */
async function getEndpointConfig(
  clusterId: string
): Promise<{ url: string; signingSecret: string }> {
  // If encryption is not configured, use fallback directly
  if (isUsingFallbackConfig()) {
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
 * Execute a SQL statement via the executor service
 */
export async function executeStatement(params: ExecuteParams): Promise<ExecuteResult> {
  const traceId = params.traceId;

  try {
    const { url, signingSecret } = await getEndpointConfig(params.clusterId);
    const path = '/api/v1/execute';

    // 添加 requestTime 确保每次请求的 body 都不同，防止 Next.js 请求去重
    const body = JSON.stringify({
      requestId: params.requestId,
      version: params.version,
      statementId: params.statementId,
      clusterId: params.clusterId,
      dbType: params.dbType,
      code: params.code,
      sql: params.sql,
      timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      requestTime: Date.now(),
    });

    // Generate signed headers
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

    const result = await response.json();
    // Handle both 'error' and 'errorMessage' for backward compatibility
    const errorMessage = result.errorMessage ?? result.error ?? null;
    return {
      success: result.success,
      statementId: result.statementId,
      processId: result.processId ?? null,
      affectedRows: result.affectedRows ?? null,
      resultRowCount: result.resultRowCount ?? null,
      resultPreview: result.resultPreview ?? null,
      durationMs: result.durationMs ?? 0,
      errorMessage,
      traceId: response.headers.get('X-Trace-ID') || signedHeaders['X-Trace-ID'],
    };
  } catch (e) {
    console.error('Failed to execute statement:', e);
    return {
      success: false,
      statementId: params.statementId,
      processId: null,
      affectedRows: null,
      resultRowCount: null,
      resultPreview: null,
      durationMs: 0,
      errorMessage: e instanceof Error ? e.message : 'Failed to connect to executor',
      traceId,
    };
  }
}

/**
 * Execute a precheck query to determine affected row count
 */
export async function executePrecheck(params: PrecheckParams): Promise<PrecheckResult> {
  const traceId = params.traceId;

  try {
    const { url, signingSecret } = await getEndpointConfig(params.clusterId);
    const path = '/api/v1/execute/precheck';

    // 添加 requestTime 确保每次请求的 body 都不同，防止 Next.js 请求去重
    const body = JSON.stringify({
      clusterId: params.clusterId,
      dbType: params.dbType,
      code: params.code,
      sql: params.sql,
      requestTime: Date.now(),
    });

    // Generate signed headers
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

    const result = await response.json();
    return {
      ...(result as PrecheckResult),
      traceId: response.headers.get('X-Trace-ID') || signedHeaders['X-Trace-ID'],
    };
  } catch (e) {
    console.error('Failed to execute precheck:', e);
    return {
      success: false,
      affectedRows: null,
      errorMessage: e instanceof Error ? e.message : 'Failed to connect to executor',
      traceId,
    };
  }
}
