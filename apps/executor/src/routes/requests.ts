/**
 * Request Management Routes
 * 请求级别管理 API，支持：
 * - 查询请求执行状态
 * - 通过 requestId 终止执行
 * - 预终止请求
 * - 列出当前执行中的请求
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { DEFAULT_DB_TYPE, dbTypeSchema } from '@sql-ops/shared';
import { getConnection } from '../db/pool';
import {
  getRequestStatus,
  markRequestTerminated,
  listExecutingRequests,
  setPreTerminate,
  checkPreTerminate,
  clearPreTerminate,
} from '../lib/redis';
import { killProcess } from '../services/process-tracker';

const requests = new Hono();

/**
 * Query timeout for database operations (5 seconds)
 */
const DB_QUERY_TIMEOUT_MS = 5000;

/**
 * Maximum retry count for KILL command
 */
const MAX_KILL_RETRIES = 3;

/**
 * Retry delay base in ms (exponential backoff)
 */
const RETRY_DELAY_BASE_MS = 200;

// ==================== Schema Definitions ====================

const requestIdParamSchema = z.object({
  requestId: z.string().uuid(),
});

const terminateBodySchema = z.object({
  reason: z.string().min(1).max(500),
  terminatedBy: z.string().min(1).max(100).optional().default('user'),
});

const preTerminateBodySchema = z.object({
  reason: z.string().min(1).max(500),
  terminatedBy: z.string().min(1).max(100).optional().default('user'),
});

const listExecutingQuerySchema = z.object({
  clusterId: z.string().min(1).optional(),
  dbType: dbTypeSchema.optional().default(DEFAULT_DB_TYPE),
  code: z.string().min(1).optional(),
});

// ==================== API Routes ====================

/**
 * Get request execution status
 * GET /api/v1/requests/:requestId/status
 */
requests.get(
  '/:requestId/status',
  zValidator('param', requestIdParamSchema),
  async (c) => {
    const { requestId } = c.req.valid('param');

    try {
      const request = await getRequestStatus(requestId);

      if (!request) {
        return c.json({
          success: true,
          request: null,
          message: '请求不存在或已过期',
        });
      }

      return c.json({
        success: true,
        request: {
          requestId: request.requestId,
          statementId: request.statementId,
          clusterId: request.clusterId,
          dbType: request.dbType,
          code: request.code,
          processId: request.processId,
          status: request.status,
          startedAt: request.startedAt,
          completedAt: request.completedAt,
          terminatedAt: request.terminatedAt,
          terminatedBy: request.terminatedBy,
          terminateReason: request.terminateReason,
          error: request.error,
          elapsedMs: Date.now() - request.startedAt,
        },
      });
    } catch (error) {
      console.error('[Requests] Failed to get request status:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : '获取请求状态失败',
        },
        500
      );
    }
  }
);

/**
 * Terminate request execution by requestId
 * POST /api/v1/requests/:requestId/terminate
 */
requests.post(
  '/:requestId/terminate',
  zValidator('param', requestIdParamSchema),
  zValidator('json', terminateBodySchema),
  async (c) => {
    const { requestId } = c.req.valid('param');
    const { reason, terminatedBy } = c.req.valid('json');

    try {
      // 1. Get request status from Redis
      const request = await getRequestStatus(requestId);

      if (!request) {
        // Request not found - set pre-terminate in case it arrives later
        await setPreTerminate(requestId, reason, terminatedBy);
        return c.json({
          success: true,
          killed: false,
          processId: null,
          wasExecuting: false,
          message: '请求不存在，已设置预终止标记',
        });
      }

      // 2. Check if request is already completed/terminated/failed
      if (
        request.status === 'completed' ||
        request.status === 'terminated' ||
        request.status === 'failed'
      ) {
        return c.json({
          success: true,
          killed: false,
          processId: request.processId,
          wasExecuting: false,
          message: `请求已${request.status === 'completed' ? '完成' : request.status === 'terminated' ? '终止' : '失败'}`,
        });
      }

      // 3. If status is pending (not yet executing), just set pre-terminate
      if (request.status === 'pending' || !request.processId) {
        await setPreTerminate(requestId, reason, terminatedBy);
        await markRequestTerminated(requestId, reason, terminatedBy);
        return c.json({
          success: true,
          killed: false,
          processId: null,
          wasExecuting: false,
          message: '请求尚未开始执行，已设置预终止标记',
        });
      }

      // 4. Request is executing - need to KILL the MySQL process
      const processId = request.processId;
      let killed = false;
      let lastError: Error | null = null;

      // Get connection and execute KILL with retries
      for (let attempt = 1; attempt <= MAX_KILL_RETRIES; attempt++) {
        let connection;
        try {
          connection = await getConnection(
            request.clusterId,
            request.dbType,
            request.code
          );

          await connection.query({
            sql: 'KILL ?',
            timeout: DB_QUERY_TIMEOUT_MS,
            values: [processId],
          });

          killed = true;
          console.log('[Requests] Killed process:', {
            requestId,
            processId,
            attempt,
            reason,
          });
          break;
        } catch (error: unknown) {
          const err = error as { code?: string; message?: string };

          // Process no longer exists - treat as successful
          if (err.code === 'ER_NO_SUCH_THREAD') {
            killed = true;
            console.log('[Requests] Process already terminated:', {
              requestId,
              processId,
            });
            break;
          }

          lastError = error instanceof Error ? error : new Error(String(error));
          console.warn('[Requests] KILL attempt failed:', {
            requestId,
            processId,
            attempt,
            error: lastError.message,
          });

          // Exponential backoff before retry
          if (attempt < MAX_KILL_RETRIES) {
            await new Promise((resolve) =>
              setTimeout(resolve, RETRY_DELAY_BASE_MS * Math.pow(2, attempt - 1))
            );
          }
        } finally {
          if (connection) {
            connection.release();
          }
        }
      }

      // 5. Update tracking records
      if (killed) {
        await markRequestTerminated(requestId, reason, terminatedBy);
        await killProcess(request.clusterId, processId, reason);
      }

      if (!killed && lastError) {
        return c.json(
          {
            success: false,
            killed: false,
            processId,
            wasExecuting: true,
            error: `无法终止进程: ${lastError.message}`,
          },
          500
        );
      }

      return c.json({
        success: true,
        killed,
        processId,
        wasExecuting: true,
        message: killed ? '请求已终止' : '进程已不存在',
      });
    } catch (error) {
      console.error('[Requests] Failed to terminate request:', error);
      return c.json(
        {
          success: false,
          killed: false,
          processId: null,
          wasExecuting: false,
          error: error instanceof Error ? error.message : '终止请求失败',
        },
        500
      );
    }
  }
);

/**
 * Pre-terminate request (before it arrives)
 * POST /api/v1/requests/:requestId/pre-terminate
 */
requests.post(
  '/:requestId/pre-terminate',
  zValidator('param', requestIdParamSchema),
  zValidator('json', preTerminateBodySchema),
  async (c) => {
    const { requestId } = c.req.valid('param');
    const { reason, terminatedBy } = c.req.valid('json');

    try {
      // Check if request already exists
      const existingRequest = await getRequestStatus(requestId);

      if (existingRequest) {
        // Request already arrived - redirect to terminate
        return c.json(
          {
            success: false,
            message: '请求已到达，请使用 terminate API',
            redirectTo: `/api/v1/requests/${requestId}/terminate`,
          },
          400
        );
      }

      // Set pre-terminate marker
      await setPreTerminate(requestId, reason, terminatedBy);

      return c.json({
        success: true,
        message: '预终止标记已设置',
        ttlSeconds: 120, // 2 minutes
      });
    } catch (error) {
      console.error('[Requests] Failed to set pre-terminate:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : '设置预终止标记失败',
        },
        500
      );
    }
  }
);

/**
 * Check pre-terminate status
 * GET /api/v1/requests/:requestId/pre-terminate
 */
requests.get(
  '/:requestId/pre-terminate',
  zValidator('param', requestIdParamSchema),
  async (c) => {
    const { requestId } = c.req.valid('param');

    try {
      const preTerminate = await checkPreTerminate(requestId);

      return c.json({
        success: true,
        preTerminate: preTerminate
          ? {
              terminatedAt: preTerminate.terminatedAt,
              reason: preTerminate.reason,
              terminatedBy: preTerminate.terminatedBy,
            }
          : null,
      });
    } catch (error) {
      console.error('[Requests] Failed to check pre-terminate:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : '检查预终止状态失败',
        },
        500
      );
    }
  }
);

/**
 * Clear pre-terminate marker
 * DELETE /api/v1/requests/:requestId/pre-terminate
 */
requests.delete(
  '/:requestId/pre-terminate',
  zValidator('param', requestIdParamSchema),
  async (c) => {
    const { requestId } = c.req.valid('param');

    try {
      await clearPreTerminate(requestId);

      return c.json({
        success: true,
        message: '预终止标记已清除',
      });
    } catch (error) {
      console.error('[Requests] Failed to clear pre-terminate:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : '清除预终止标记失败',
        },
        500
      );
    }
  }
);

/**
 * List currently executing requests
 * GET /api/v1/requests/executing
 */
requests.get(
  '/executing',
  zValidator('query', listExecutingQuerySchema),
  async (c) => {
    const { clusterId, dbType, code } = c.req.valid('query');

    try {
      const executingRequests = await listExecutingRequests({
        clusterId,
        dbType,
        code,
      });

      // Add elapsed time to each request
      const now = Date.now();
      const requestsWithElapsed = executingRequests.map((req) => ({
        requestId: req.requestId,
        statementId: req.statementId,
        clusterId: req.clusterId,
        dbType: req.dbType,
        code: req.code,
        processId: req.processId,
        sql: req.sql,
        startedAt: req.startedAt,
        timeoutMs: req.timeoutMs,
        elapsedMs: now - req.startedAt,
      }));

      return c.json({
        success: true,
        requests: requestsWithElapsed,
        count: requestsWithElapsed.length,
        filter: { clusterId, dbType, code },
      });
    } catch (error) {
      console.error('[Requests] Failed to list executing requests:', error);
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : '获取执行中请求列表失败',
        },
        500
      );
    }
  }
);

export { requests };
