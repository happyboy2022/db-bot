/**
 * Execute SQL endpoint
 * Handles SQL execution with validation and result processing
 *
 * 增强功能：
 * - 请求级别追踪（RID -> PID 映射）
 * - 预终止机制检查
 * - 在 SQL 执行前记录 processId
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  executeRequestSchema,
  preCheckRequestSchema,
  MAX_AFFECTED_ROWS,
} from '@sql-ops/shared';
import { executeStatement, executePrecheck } from '../services/executor';
import { trackProcess, completeProcess } from '../services/process-tracker';
import { isValidTarget } from '../db/validator';
import {
  trackRequest,
  updateRequestExecuting,
  updateRequestStatus,
  checkPreTerminate,
} from '../lib/redis';

const execute = new Hono();

/**
 * Execute SQL statement endpoint
 * POST /api/v1/execute
 */
execute.post(
  '/',
  zValidator('json', executeRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    // Step 1: Validate target is in whitelist
    if (!isValidTarget(body.clusterId, body.dbType, body.code)) {
      return c.json(
        {
          success: false,
          statementId: body.statementId,
          affectedRows: null,
          resultRowCount: null,
          resultPreview: null,
          durationMs: 0,
          errorMessage: `Unknown target: ${body.clusterId}/${body.dbType}/${body.code}`,
        },
        400
      );
    }

    // Step 2: 检查预终止标记
    try {
      const preTerminate = await checkPreTerminate(body.requestId);
      if (preTerminate) {
        console.log('[Execute] Request pre-terminated:', {
          requestId: body.requestId,
          reason: preTerminate.reason,
          terminatedBy: preTerminate.terminatedBy,
        });
        return c.json(
          {
            success: false,
            statementId: body.statementId,
            processId: null,
            affectedRows: null,
            resultRowCount: null,
            resultPreview: null,
            durationMs: 0,
            errorMessage: `请求已被预终止: ${preTerminate.reason}`,
            terminated: true,
          },
          200
        );
      }
    } catch (error) {
      console.warn('[Execute] Failed to check pre-terminate:', error);
      // 继续执行，不因预终止检查失败阻塞请求
    }

    // Step 3: 创建请求级别追踪（状态：pending）
    try {
      await trackRequest({
        requestId: body.requestId,
        statementId: body.statementId,
        clusterId: body.clusterId,
        dbType: body.dbType,
        code: body.code,
        sql: body.sql,
        timeoutMs: body.timeoutMs,
      });
    } catch (error) {
      console.warn('[Execute] Failed to track request:', error);
      // 继续执行，不因追踪失败阻塞请求
    }

    // Step 4: Execute the statement with processId callback
    const result = await executeStatement({
      clusterId: body.clusterId,
      dbType: body.dbType,
      code: body.code,
      sql: body.sql,
      timeoutMs: body.timeoutMs,
      // 在获取 processId 后立即更新请求追踪
      onProcessIdObtained: async (processId: number) => {
        try {
          // 更新请求追踪（状态：executing，记录 processId）
          await updateRequestExecuting(body.requestId, processId);

          // 同时更新进程级别追踪（保持向后兼容）
          await trackProcess({
            clusterId: body.clusterId,
            dbType: body.dbType,
            code: body.code,
            processId,
            statementId: body.statementId,
            requestId: body.requestId,
            sql: body.sql,
            timeoutMs: body.timeoutMs,
          });
        } catch (error) {
          console.warn('[Execute] Failed to update request executing:', error);
        }
      },
    });

    // Step 5: 更新请求状态（完成/失败）
    try {
      if (result.success) {
        await updateRequestStatus(body.requestId, 'completed');
      } else {
        await updateRequestStatus(body.requestId, 'failed', result.error?.message);
      }
    } catch (error) {
      console.warn('[Execute] Failed to update request status:', error);
    }

    // Step 6: Track process completion (保持向后兼容)
    if (result.processId) {
      try {
        await completeProcess(
          body.clusterId,
          result.processId,
          result.success ? undefined : result.error?.message
        );
      } catch (error) {
        console.warn('[Execute] Failed to complete process:', error);
      }
    }

    // Step 7: Validate affected rows limit for write operations
    if (
      result.success &&
      result.result?.type === 'write' &&
      result.result.affectedRows !== undefined &&
      result.result.affectedRows > MAX_AFFECTED_ROWS
    ) {
      return c.json(
        {
          success: false,
          statementId: body.statementId,
          processId: result.processId ?? null,
          affectedRows: result.result.affectedRows,
          resultRowCount: null,
          resultPreview: null,
          durationMs: result.durationMs,
          errorMessage: `操作影响行数 (${result.result.affectedRows}) 超过最大限制 (${MAX_AFFECTED_ROWS})`,
        },
        400
      );
    }

    // Step 8: Return response
    if (result.success) {
      return c.json({
        success: true,
        statementId: body.statementId,
        processId: result.processId ?? null,
        affectedRows: result.result?.affectedRows ?? null,
        resultRowCount: result.result?.rowCount ?? null,
        resultPreview:
          result.result?.type === 'select'
            ? {
                columns: result.result.columns,
                rows: result.result.rows,
                truncated: result.result.truncated,
              }
            : null,
        durationMs: result.durationMs,
        errorMessage: null,
      });
    } else {
      return c.json(
        {
          success: false,
          statementId: body.statementId,
          processId: result.processId ?? null,
          affectedRows: null,
          resultRowCount: null,
          resultPreview: null,
          durationMs: result.durationMs,
          errorMessage: result.error?.message ?? 'Unknown error',
        },
        result.error?.code === 'SQL_VALIDATION_FAILED' ? 400 : 500
      );
    }
  }
);

/**
 * Pre-check SQL statement endpoint
 * POST /api/v1/execute/precheck
 *
 * Executes a SELECT COUNT query to verify how many rows would be affected
 * by an UPDATE/DELETE statement before actual execution
 */
execute.post(
  '/precheck',
  zValidator('json', preCheckRequestSchema),
  async (c) => {
    const body = c.req.valid('json');

    // Step 1: Validate target is in whitelist
    if (!isValidTarget(body.clusterId, body.dbType, body.code)) {
      return c.json(
        {
          success: false,
          affectedRows: null,
          errorMessage: `Unknown target: ${body.clusterId}/${body.dbType}/${body.code}`,
        },
        400
      );
    }

    // Step 2: Execute the precheck query
    const result = await executePrecheck(
      body.clusterId,
      body.dbType,
      body.code,
      body.sql
    );

    // Step 3: Validate affected rows limit
    if (result.success && result.affectedRows !== null) {
      if (result.affectedRows > MAX_AFFECTED_ROWS) {
        return c.json(
          {
            success: false,
            affectedRows: result.affectedRows,
            errorMessage: `操作影响行数 (${result.affectedRows}) 超过最大限制 (${MAX_AFFECTED_ROWS})`,
          },
          400
        );
      }
    }

    // Step 4: Return response
    if (result.success) {
      return c.json({
        success: true,
        affectedRows: result.affectedRows,
        errorMessage: null,
      });
    } else {
      return c.json(
        {
          success: false,
          affectedRows: null,
          errorMessage: result.error ?? 'Unknown error',
        },
        500
      );
    }
  }
);

export { execute };
