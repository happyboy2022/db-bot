/**
 * Database health check utilities
 * Checks connectivity and latency for all configured targets
 */

import { getAllTargets } from './config';
import { getPool } from './pool';

/** Health check query timeout in milliseconds */
const HEALTH_CHECK_TIMEOUT_MS = 5000;

/**
 * Health status for a single database target
 */
export interface DbHealthStatus {
  clusterId: string;
  dbType: string;
  code: string;
  available: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Overall health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  timestamp: string;
  targets: DbHealthStatus[];
}

/**
 * Check health of a specific database target
 */
export async function checkTargetDbHealth(
  clusterId: string,
  dbType: string,
  code: string
): Promise<DbHealthStatus> {
  const startTime = Date.now();

  try {
    const pool = await getPool(clusterId, dbType, code);
    const connection = await pool.getConnection();

    try {
      // Simple query to test connectivity with timeout
      await connection.query({
        sql: 'SELECT 1',
        timeout: HEALTH_CHECK_TIMEOUT_MS,
      });

      return {
        clusterId,
        dbType,
        code,
        available: true,
        latencyMs: Date.now() - startTime,
      };
    } finally {
      connection.release();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return {
      clusterId,
      dbType,
      code,
      available: false,
      latencyMs: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Check health of all configured database targets
 */
export async function checkDbHealth(): Promise<HealthCheckResult> {
  const targets = getAllTargets();
  const healthPromises = targets.map((target) =>
    checkTargetDbHealth(target.clusterId, target.dbType, target.code)
  );

  const results = await Promise.all(healthPromises);

  // Overall health is true only if all targets are available
  const healthy = results.every((r) => r.available);

  return {
    healthy,
    timestamp: new Date().toISOString(),
    targets: results,
  };
}

/**
 * Quick health check - returns true if at least one target is available
 */
export async function quickHealthCheck(): Promise<boolean> {
  const targets = getAllTargets();

  if (targets.length === 0) {
    // No targets configured, service is healthy (can still serve requests)
    return true;
  }

  // Check first target only for quick check
  const firstTarget = targets[0];
  const result = await checkTargetDbHealth(
    firstTarget.clusterId,
    firstTarget.dbType,
    firstTarget.code
  );

  return result.available;
}
