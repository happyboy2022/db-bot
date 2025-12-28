/**
 * MySQL connection pool factory
 * Lazily creates and caches connection pools for each target
 */

import mysql from 'mysql2/promise';
import type { Pool, PoolConnection } from 'mysql2/promise';
import type { DbType, DbCode } from '@sql-ops/shared';
import { getTargetConfig } from './config';

/**
 * Pool configuration options
 */
const POOL_CONFIG = {
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
};

/** Cache of connection pools keyed by target string */
const pools = new Map<string, Pool>();

/** Cache of pending pool creation promises to prevent race conditions */
const pendingPools = new Map<string, Promise<Pool>>();

/**
 * Generate a unique key for a target
 */
function getPoolKey(clusterId: string, dbType: string, code: string): string {
  return `${clusterId}:${dbType}:${code}`;
}

/**
 * Get or create a connection pool for the specified target
 * Thread-safe: concurrent calls for the same target share one pool
 */
export async function getPool(
  clusterId: string,
  dbType: DbType | string,
  code: DbCode | string
): Promise<Pool> {
  const key = getPoolKey(clusterId, dbType, code);

  // Return existing pool if available
  const existingPool = pools.get(key);
  if (existingPool) {
    return existingPool;
  }

  // Return pending creation if in progress (prevents race condition)
  const pendingPool = pendingPools.get(key);
  if (pendingPool) {
    return pendingPool;
  }

  // Create pool with promise caching
  const createPromise = createPool(key, clusterId, dbType, code);
  pendingPools.set(key, createPromise);

  try {
    const pool = await createPromise;
    pools.set(key, pool);
    return pool;
  } finally {
    pendingPools.delete(key);
  }
}

/**
 * Create a new connection pool
 */
async function createPool(
  key: string,
  clusterId: string,
  dbType: DbType | string,
  code: DbCode | string
): Promise<Pool> {
  const config = getTargetConfig(clusterId, dbType, code);
  if (!config) {
    throw new Error(`Unknown database target: ${key}`);
  }

  return mysql.createPool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ...POOL_CONFIG,
  });
}

/**
 * Get a connection from the pool
 * Remember to release the connection after use
 */
export async function getConnection(
  clusterId: string,
  dbType: DbType | string,
  code: DbCode | string
): Promise<PoolConnection> {
  const pool = await getPool(clusterId, dbType, code);
  return pool.getConnection();
}

/**
 * Close all connection pools
 * Should be called when shutting down the service
 */
export async function closeAllPools(): Promise<void> {
  const closePromises: Promise<void>[] = [];

  for (const [key, pool] of pools) {
    closePromises.push(
      pool.end().catch((err) => {
        console.error(`Error closing pool ${key}:`, err);
      })
    );
  }

  await Promise.all(closePromises);
  pools.clear();
}

/**
 * Close a specific connection pool
 */
export async function closePool(
  clusterId: string,
  dbType: DbType | string,
  code: DbCode | string
): Promise<void> {
  const key = getPoolKey(clusterId, dbType, code);
  const pool = pools.get(key);

  if (pool) {
    await pool.end();
    pools.delete(key);
  }
}

/**
 * Check if a pool exists for the target
 */
export function hasPool(
  clusterId: string,
  dbType: DbType | string,
  code: DbCode | string
): boolean {
  const key = getPoolKey(clusterId, dbType, code);
  return pools.has(key);
}

/** Pool statistics for monitoring */
export interface PoolStats {
  key: string;
  totalConnections: number;
  idleConnections: number;
  waitingRequests: number;
}

/**
 * Type guard to check if internal pool API is available
 * mysql2 exposes internal pool properties which are not part of the public API
 */
function hasInternalPoolApi(pool: unknown): pool is {
  _allConnections?: unknown[];
  _freeConnections?: unknown[];
  _connectionQueue?: unknown[];
} {
  if (!pool || typeof pool !== 'object') {
    return false;
  }

  const p = pool as Record<string, unknown>;
  return (
    ('_allConnections' in p && Array.isArray(p._allConnections)) ||
    ('_freeConnections' in p && Array.isArray(p._freeConnections)) ||
    ('_connectionQueue' in p && Array.isArray(p._connectionQueue))
  );
}

/**
 * Get pool statistics for monitoring
 * Note: Uses internal mysql2 pool properties which may change between versions
 * Falls back gracefully when internal APIs are not available
 */
export function getPoolStats(): PoolStats[] {
  const stats: PoolStats[] = [];
  let warningLogged = false;

  for (const [key, pool] of pools) {
    try {
      // mysql2 pool exposes internal pool through pool.pool
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const internalPool = (pool as any).pool;

      if (!internalPool) {
        // Internal pool structure not found
        if (!warningLogged) {
          console.warn(
            '[Pool] Internal pool API not available - connection statistics will be unavailable. ' +
              'This may be due to a mysql2 version incompatibility.'
          );
          warningLogged = true;
        }
        stats.push({ key, totalConnections: -1, idleConnections: -1, waitingRequests: -1 });
        continue;
      }

      // Check if internal APIs exist before accessing
      if (!hasInternalPoolApi(internalPool)) {
        if (!warningLogged) {
          console.warn(
            '[Pool] Internal pool properties (_allConnections, _freeConnections, _connectionQueue) not available. ' +
              'Using degraded statistics mode. This may be due to mysql2 API changes.'
          );
          warningLogged = true;
        }
        // Return partial data - pool exists but internals unavailable
        stats.push({ key, totalConnections: 0, idleConnections: 0, waitingRequests: 0 });
        continue;
      }

      // Extract statistics from internal pool
      const totalConnections = internalPool._allConnections?.length ?? 0;
      const idleConnections = internalPool._freeConnections?.length ?? 0;
      const waitingRequests = internalPool._connectionQueue?.length ?? 0;

      stats.push({
        key,
        totalConnections,
        idleConnections,
        waitingRequests,
      });
    } catch (error) {
      // If accessing internals fails, return placeholder
      if (!warningLogged) {
        console.warn(
          `[Pool] Error accessing pool statistics: ${error instanceof Error ? error.message : String(error)}. ` +
            'Using degraded statistics mode.'
        );
        warningLogged = true;
      }
      stats.push({ key, totalConnections: -1, idleConnections: -1, waitingRequests: -1 });
    }
  }

  return stats;
}
