/**
 * SQL Executor Service
 * Handles SQL execution with validation, timeout, and result processing
 */

import type { PoolConnection, RowDataPacket, FieldPacket, ResultSetHeader } from 'mysql2/promise';
import { getConnection } from '../db/pool';
import { validateSql, MAX_RESULT_ROWS, MAX_AFFECTED_ROWS } from '@sql-ops/shared';

/**
 * Options for executing a SQL statement
 */
export interface ExecuteOptions {
  clusterId: string;
  dbType: string;
  code: string;
  sql: string;
  timeoutMs: number;
  /**
   * 获取 processId 后的回调
   * 在执行 SQL 之前调用，用于更新请求追踪
   */
  onProcessIdObtained?: (processId: number) => Promise<void>;
}

/**
 * Result of SQL execution
 */
export interface ExecuteResult {
  success: boolean;
  durationMs: number;
  processId?: number;
  result?: {
    type: 'select' | 'write';
    rows?: Record<string, unknown>[];
    columns?: string[];
    rowCount?: number;
    truncated?: boolean;
    affectedRows?: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Execute a single SQL statement
 */
export async function executeStatement(
  options: ExecuteOptions
): Promise<ExecuteResult> {
  const startTime = Date.now();

  // Step 1: Validate SQL on the executor side (defense in depth)
  const validation = validateSql(options.sql);
  if (!validation.valid) {
    return {
      success: false,
      durationMs: Date.now() - startTime,
      error: {
        code: 'SQL_VALIDATION_FAILED',
        message: validation.errors.join('; '),
      },
    };
  }

  // Step 2: Get connection from pool
  let connection: PoolConnection | null = null;

  try {
    connection = await getConnection(
      options.clusterId,
      options.dbType,
      options.code
    );

    // Step 3: Get connection/process ID
    const [idResult] = await connection.query<RowDataPacket[]>(
      'SELECT CONNECTION_ID() as id'
    );
    const processId = idResult[0]?.id as number;

    // Step 3.5: 通知 processId 已获取（用于请求追踪）
    if (options.onProcessIdObtained) {
      try {
        await options.onProcessIdObtained(processId);
      } catch (callbackError) {
        console.warn('[executor] onProcessIdObtained callback failed:', callbackError);
        // 继续执行，不因回调失败阻塞 SQL 执行
      }
    }

    // Step 4: Set statement timeout (MySQL 5.7.8+)
    // MAX_EXECUTION_TIME is specified in milliseconds
    try {
      await connection.query(
        `SET SESSION MAX_EXECUTION_TIME = ${options.timeoutMs}`
      );
    } catch {
      // Fallback: Some MySQL versions may not support MAX_EXECUTION_TIME
      // We'll rely on application-level timeout in that case
      console.warn(
        `[executor] Could not set MAX_EXECUTION_TIME, falling back to application timeout`
      );
    }

    // Step 5: Determine if this is a write operation (UPDATE/DELETE)
    const statement = validation.statements[0];
    const isWriteOperation = statement?.type === 'update' || statement?.type === 'delete';

    // Step 6: Execute the SQL statement
    // For write operations, use transaction to enforce MAX_AFFECTED_ROWS
    if (isWriteOperation) {
      // Start transaction for write operations
      await connection.beginTransaction();

      try {
        const [result] = await connection.query(options.sql);
        const header = result as ResultSetHeader;

        // Check if affected rows exceed limit
        if (header.affectedRows > MAX_AFFECTED_ROWS) {
          // Rollback if too many rows would be affected
          await connection.rollback();

          return {
            success: false,
            durationMs: Date.now() - startTime,
            processId,
            error: {
              code: 'MAX_AFFECTED_ROWS_EXCEEDED',
              message: `Operation would affect ${header.affectedRows} rows, exceeding limit of ${MAX_AFFECTED_ROWS}. Transaction rolled back.`,
            },
          };
        }

        // Commit if within limit
        await connection.commit();

        return {
          success: true,
          durationMs: Date.now() - startTime,
          processId,
          result: {
            type: 'write',
            affectedRows: header.affectedRows,
          },
        };
      } catch (error) {
        // Rollback on error
        await connection.rollback();
        throw error;
      }
    } else {
      // SELECT operations - no transaction needed
      const [result, fields] = await connection.query(options.sql);

      // SELECT result
      const rows = result as RowDataPacket[];
      const truncated = rows.length > MAX_RESULT_ROWS;
      const limitedRows = rows.slice(0, MAX_RESULT_ROWS);

      // Extract column names from fields
      const columns = (fields as FieldPacket[])?.map((f) => f.name) ?? [];

      return {
        success: true,
        durationMs: Date.now() - startTime,
        processId,
        result: {
          type: 'select',
          rows: limitedRows as Record<string, unknown>[],
          columns,
          rowCount: rows.length,
          truncated,
        },
      };
    }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string };

    return {
      success: false,
      durationMs: Date.now() - startTime,
      error: {
        code: err.code ?? 'QUERY_ERROR',
        message: err.message ?? 'Unknown error occurred',
      },
    };
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

/**
 * Execute a pre-check query (SELECT COUNT to verify affected rows)
 */
export async function executePrecheck(
  clusterId: string,
  dbType: string,
  code: string,
  precheckSql: string
): Promise<{
  success: boolean;
  affectedRows: number | null;
  error?: string;
}> {
  let connection: PoolConnection | null = null;

  try {
    connection = await getConnection(clusterId, dbType, code);

    // Validate that precheckSql is a SELECT
    const validation = validateSql(precheckSql);
    if (!validation.valid) {
      return {
        success: false,
        affectedRows: null,
        error: `Invalid precheck SQL: ${validation.errors.join('; ')}`,
      };
    }

    const statement = validation.statements[0];
    if (statement?.type !== 'select') {
      return {
        success: false,
        affectedRows: null,
        error: 'Precheck SQL must be a SELECT statement',
      };
    }

    // Execute the precheck query
    const [result] = await connection.query<RowDataPacket[]>(precheckSql);

    // Extract count from result
    // Expected format: SELECT COUNT(*) as cnt FROM ...
    const row = result[0];
    if (!row) {
      return {
        success: false,
        affectedRows: null,
        error: 'Precheck query returned no results',
      };
    }

    // Try to get count from various possible column names
    const count =
      row.cnt ?? row.count ?? row.COUNT ?? row['COUNT(*)'] ?? row.c;

    if (typeof count !== 'number') {
      return {
        success: false,
        affectedRows: null,
        error: 'Precheck query did not return a count value',
      };
    }

    return {
      success: true,
      affectedRows: count,
    };
  } catch (error: unknown) {
    const err = error as { message?: string };

    return {
      success: false,
      affectedRows: null,
      error: err.message ?? 'Unknown error during precheck',
    };
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
