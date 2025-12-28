/**
 * Executor sessions API client
 * Handles session management for cluster-specific Executor services
 * Implements HMAC-SHA256 signing with timestamp and nonce for replay protection
 */

import { DEFAULT_DB_TYPE, type DbType } from '@sql-ops/shared';
import { getExecutorConfig, isUsingFallbackConfig } from './config';
import { createSignedHeaders, getSigningSecret } from './signing';

// Fallback configuration for backward compatibility
const FALLBACK_EXECUTOR_URL = process.env.EXECUTOR_BASE_URL || 'http://localhost:8787';
const FALLBACK_SIGNING_SECRET = process.env.EXECUTOR_SIGNING_SECRET || '';

export interface SessionInfo {
  id: number;
  user: string;
  host: string;
  db: string | null;
  command: string;
  time: number;
  state: string | null;
  info: string | null;
  isSystemOwned: boolean;
  statementId?: string;
  requestId?: string;
}

export interface SessionTarget {
  clusterId: string;
  dbType: string;
  code: string;
}

export interface SessionFilterOptions {
  /** Only show sessions for the configured database user (from connection string) */
  filterByConfiguredUser?: boolean;
  /** Exclude idle sessions (Sleep, Binlog Dump, Connect, Daemon, etc.) */
  excludeIdleSessions?: boolean;
}

export interface SessionFilterStats {
  totalFromDb: number;
  afterUserFilter: number;
  afterIdleFilter: number;
  filteredByUser: number;
  filteredByIdle: number;
}

export interface GetSessionsResult {
  success: boolean;
  sessions?: SessionInfo[];
  count?: number;
  target?: SessionTarget;
  /** The configured database user from connection string */
  configuredUser?: string;
  /** Filter statistics showing what was filtered out */
  filterStats?: SessionFilterStats;
  /** Applied filter options */
  appliedFilters?: SessionFilterOptions;
  error?: string;
  traceId?: string;
}

export interface GetTargetsResult {
  success: boolean;
  targets?: SessionTarget[];
  error?: string;
  traceId?: string;
}

export interface KillSessionResult {
  success: boolean;
  killed?: boolean;
  processId?: number;
  wasSystemOwned?: boolean;
  message?: string;
  error?: string;
  traceId?: string;
}

/**
 * Get executor endpoint configuration
 * Uses cluster-specific config or falls back to environment variables
 */
async function getEndpointConfig(
  clusterId?: string
): Promise<{ url: string; signingSecret: string }> {
  // If no cluster ID or encryption not configured, use fallback
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
 * Get available session targets from executor
 * Note: This uses the fallback configuration as it needs to aggregate from all clusters
 */
export async function getSessionTargets(traceId?: string): Promise<GetTargetsResult> {
  try {
    const { url, signingSecret } = await getEndpointConfig();
    const path = '/api/v1/sessions/targets';

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
      ...(result as GetTargetsResult),
      traceId: response.headers.get('X-Trace-ID') || signedHeaders['X-Trace-ID'],
    };
  } catch (e) {
    console.error('Failed to get session targets:', e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to connect to executor',
    };
  }
}

/**
 * Get sessions for a specific target
 */
export async function getSessions(
  clusterId: string,
  code: string,
  dbType: DbType = DEFAULT_DB_TYPE,
  traceId?: string,
  filterOptions?: SessionFilterOptions
): Promise<GetSessionsResult> {
  try {
    const { url, signingSecret } = await getEndpointConfig(clusterId);

    const params = new URLSearchParams({
      clusterId,
      code,
      dbType,
    });

    // Add filter options (default to true if not specified)
    const filterByConfiguredUser = filterOptions?.filterByConfiguredUser ?? true;
    const excludeIdleSessions = filterOptions?.excludeIdleSessions ?? true;
    params.set('filterByConfiguredUser', String(filterByConfiguredUser));
    params.set('excludeIdleSessions', String(excludeIdleSessions));

    const path = `/api/v1/sessions?${params}`;

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
      ...(result as GetSessionsResult),
      traceId: response.headers.get('X-Trace-ID') || signedHeaders['X-Trace-ID'],
    };
  } catch (e) {
    console.error('Failed to get sessions:', e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to connect to executor',
    };
  }
}

/**
 * Kill a database session
 */
export async function killSession(
  clusterId: string,
  code: string,
  processId: number,
  reason: string,
  dbType: DbType = DEFAULT_DB_TYPE,
  traceId?: string
): Promise<KillSessionResult> {
  try {
    const { url, signingSecret } = await getEndpointConfig(clusterId);
    const path = '/api/v1/sessions/kill';

    // 添加 requestTime 确保每次请求的 body 都不同，防止 Next.js 请求去重
    const body = JSON.stringify({
      clusterId,
      dbType,
      code,
      processId,
      reason,
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
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Executor request failed: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    return {
      ...(result as KillSessionResult),
      traceId: response.headers.get('X-Trace-ID') || signedHeaders['X-Trace-ID'],
    };
  } catch (e) {
    console.error('Failed to kill session:', e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Failed to connect to executor',
    };
  }
}
