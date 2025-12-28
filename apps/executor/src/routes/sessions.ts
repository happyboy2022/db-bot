import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { DEFAULT_DB_TYPE, dbTypeSchema, IDLE_COMMANDS } from '@sql-ops/shared';
import { getConnection } from '../db/pool';
import { getAllTargets, getTargetConfig } from '../db/config';
import {
  isSystemOwnedProcess,
  getProcessInfo,
  killProcess,
  listProcesses,
  getTrackerMode,
} from '../services/process-tracker';

const sessions = new Hono();

/**
 * Query timeout for session operations (5 seconds)
 * Prevents hanging on slow database responses
 */
const SESSION_QUERY_TIMEOUT_MS = 5000;

/**
 * Processed session with system ownership info
 */
interface SessionInfo {
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

const listQuerySchema = z.object({
  clusterId: z.string().min(1),
  dbType: dbTypeSchema.optional().default(DEFAULT_DB_TYPE),
  code: z.string().min(1),
  // Filter options
  filterByConfiguredUser: z.coerce.boolean().optional().default(true),
  excludeIdleSessions: z.coerce.boolean().optional().default(true),
});

const killBodySchema = z.object({
  clusterId: z.string().min(1),
  dbType: dbTypeSchema.optional().default(DEFAULT_DB_TYPE),
  code: z.string().min(1),
  processId: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});

/**
 * List active database sessions endpoint
 * GET /api/v1/sessions?clusterId=xxx&code=xxx&filterByConfiguredUser=true&excludeIdleSessions=true
 */
sessions.get('/', zValidator('query', listQuerySchema), async (c) => {
  try {
    const { clusterId, dbType, code, filterByConfiguredUser, excludeIdleSessions } = c.req.valid('query');

    // Get the configured user for this target
    const targetConfig = getTargetConfig(clusterId, dbType, code);
    const configuredUser = targetConfig?.user;

    // Get a connection from the pool
    let connection;
    try {
      connection = await getConnection(clusterId, dbType, code);
    } catch (e) {
      return c.json({
        success: false,
        error: `Failed to connect to target: ${e instanceof Error ? e.message : 'Unknown error'}`,
      }, 400);
    }

    try {
      // Run SHOW PROCESSLIST with timeout to prevent hanging
      const [rows] = await connection.query({
        sql: 'SHOW PROCESSLIST',
        timeout: SESSION_QUERY_TIMEOUT_MS,
      });
      const dbSessions = rows as Array<{
        Id: number;
        User: string;
        Host: string;
        db: string | null;
        Command: string;
        Time: number;
        State: string | null;
        Info: string | null;
      }>;

      // Track filter statistics
      const totalFromDb = dbSessions.length;
      let filteredByUser = 0;
      let filteredByIdle = 0;

      // Apply filters
      let filteredSessions = dbSessions;

      // Filter 1: Only show sessions for the configured database user
      if (filterByConfiguredUser && configuredUser) {
        const beforeCount = filteredSessions.length;
        filteredSessions = filteredSessions.filter(row => row.User === configuredUser);
        filteredByUser = beforeCount - filteredSessions.length;
      }

      const afterUserFilter = filteredSessions.length;

      // Filter 2: Exclude idle sessions (Sleep, Binlog Dump, etc.)
      if (excludeIdleSessions) {
        const beforeCount = filteredSessions.length;
        filteredSessions = filteredSessions.filter(row =>
          !IDLE_COMMANDS.includes(row.Command as typeof IDLE_COMMANDS[number])
        );
        filteredByIdle = beforeCount - filteredSessions.length;
      }

      const afterIdleFilter = filteredSessions.length;

      // Map to our format and add system ownership info
      // Use Promise.all for async lookups
      const sessionInfos: SessionInfo[] = await Promise.all(
        filteredSessions.map(async (row) => {
          const [isOwned, processInfo] = await Promise.all([
            isSystemOwnedProcess(clusterId, row.Id),
            getProcessInfo(clusterId, row.Id),
          ]);

          return {
            id: row.Id,
            user: row.User,
            host: row.Host,
            db: row.db,
            command: row.Command,
            time: row.Time,
            state: row.State,
            info: row.Info,
            isSystemOwned: isOwned,
            statementId: processInfo?.statementId,
            requestId: processInfo?.requestId,
          };
        })
      );

      return c.json({
        success: true,
        sessions: sessionInfos,
        count: sessionInfos.length,
        target: { clusterId, dbType, code },
        trackerMode: getTrackerMode(),
        configuredUser: configuredUser || undefined,
        filterStats: {
          totalFromDb,
          afterUserFilter,
          afterIdleFilter,
          filteredByUser,
          filteredByIdle,
        },
        appliedFilters: {
          filterByConfiguredUser,
          excludeIdleSessions,
        },
      });
    } finally {
      connection.release();
    }
  } catch (e) {
    console.error('Failed to list sessions:', e);
    return c.json({
      success: false,
      error: e instanceof Error ? e.message : 'Failed to list sessions',
    }, 500);
  }
});

/**
 * Get available targets for session management
 * GET /api/v1/sessions/targets
 */
sessions.get('/targets', (c) => {
  const targets = getAllTargets();
  return c.json({
    success: true,
    targets,
    trackerMode: getTrackerMode(),
  });
});

/**
 * List tracked processes (from Redis or memory)
 * GET /api/v1/sessions/tracked?clusterId=xxx&dbType=xxx&code=xxx
 */
sessions.get('/tracked', zValidator('query', listQuerySchema), async (c) => {
  try {
    const { clusterId, dbType, code } = c.req.valid('query');

    const processes = await listProcesses(clusterId, dbType, code);

    return c.json({
      success: true,
      processes,
      count: processes.length,
      target: { clusterId, dbType, code },
      trackerMode: getTrackerMode(),
    });
  } catch (e) {
    console.error('Failed to list tracked processes:', e);
    return c.json({
      success: false,
      error: e instanceof Error ? e.message : 'Failed to list tracked processes',
    }, 500);
  }
});

/**
 * Kill a database session endpoint
 * POST /api/v1/sessions/kill
 */
sessions.post('/kill', zValidator('json', killBodySchema), async (c) => {
  try {
    const { clusterId, dbType, code, processId, reason } = c.req.valid('json');

    // Verify this is a system-owned process (optional but recommended for safety)
    const isOwned = await isSystemOwnedProcess(clusterId, processId);

    // Get a connection from the pool
    let connection;
    try {
      connection = await getConnection(clusterId, dbType, code);
    } catch (e) {
      return c.json({
        success: false,
        error: `Failed to connect to target: ${e instanceof Error ? e.message : 'Unknown error'}`,
      }, 400);
    }

    try {
      // Execute KILL command with timeout to prevent hanging
      await connection.query({
        sql: 'KILL ?',
        timeout: SESSION_QUERY_TIMEOUT_MS,
        values: [processId],
      });

      // Mark as killed in tracker
      await killProcess(clusterId, processId, reason);

      console.log(`[sessions] Killed process ${processId} (system-owned: ${isOwned}). Reason: ${reason}`);

      return c.json({
        success: true,
        killed: true,
        processId,
        wasSystemOwned: isOwned,
        reason,
        trackerMode: getTrackerMode(),
      });
    } catch (e: unknown) {
      // Handle case where process no longer exists
      const error = e as { code?: string; message?: string };
      if (error.code === 'ER_NO_SUCH_THREAD') {
        // Mark as killed in tracker (process already gone)
        await killProcess(clusterId, processId, `${reason} (process already terminated)`);

        return c.json({
          success: true,
          killed: false,
          processId,
          message: 'Process no longer exists',
          trackerMode: getTrackerMode(),
        });
      }
      throw e;
    } finally {
      connection.release();
    }
  } catch (e) {
    console.error('Failed to kill session:', e);
    return c.json({
      success: false,
      error: e instanceof Error ? e.message : 'Failed to kill session',
    }, 500);
  }
});

export { sessions };
