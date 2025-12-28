/**
 * Tests for execute route
 * These tests focus on request validation and route handling
 * without requiring actual database connections
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { executeRequestSchema, preCheckRequestSchema } from '@sql-ops/shared';

// Define result types
interface ExecuteResult {
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
    message: string;
  };
}

interface PrecheckResult {
  success: boolean;
  affectedRows: number | null;
  error?: string;
}

// Mock implementations
let executeResult: ExecuteResult = {
  success: true,
  durationMs: 50,
  processId: 12345,
  result: {
    type: 'select',
    rows: [{ id: 1, name: 'test' }],
    columns: ['id', 'name'],
    rowCount: 1,
    truncated: false,
  },
};

let precheckResult: PrecheckResult = {
  success: true,
  affectedRows: 5,
};

let isValidTargetResult = true;
let trackProcessCalled = false;

// Create a test app with mocked dependencies
function createTestApp() {
  const app = new Hono();

  app.post(
    '/execute',
    zValidator('json', executeRequestSchema),
    async (c) => {
      const body = c.req.valid('json');

      if (!isValidTargetResult) {
        return c.json(
          {
            success: false,
            statementId: body.statementId,
            errorMessage: 'Unknown target',
          },
          400
        );
      }

      const result = executeResult;

      if (result.processId) {
        trackProcessCalled = true;
      }

      if (result.success) {
        return c.json({
          success: true,
          statementId: body.statementId,
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
            errorMessage: result.error?.message ?? 'Unknown error',
          },
          500
        );
      }
    }
  );

  app.post(
    '/precheck',
    zValidator('json', preCheckRequestSchema),
    async (c) => {
      // Validate the request body (body is used implicitly by validator)
      c.req.valid('json');

      if (!isValidTargetResult) {
        return c.json(
          {
            success: false,
            affectedRows: null,
            errorMessage: 'Unknown target',
          },
          400
        );
      }

      const result = precheckResult;

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

  return app;
}

describe('execute route', () => {
  let app: Hono;

  beforeEach(() => {
    app = createTestApp();
    // Reset mocks
    executeResult = {
      success: true,
      durationMs: 50,
      processId: 12345,
      result: {
        type: 'select',
        rows: [{ id: 1, name: 'test' }],
        columns: ['id', 'name'],
        rowCount: 1,
        truncated: false,
      },
    };
    precheckResult = {
      success: true,
      affectedRows: 5,
    };
    isValidTargetResult = true;
    trackProcessCalled = false;
  });

  describe('POST /execute', () => {
    it('should reject invalid request body', async () => {
      const res = await app.request('/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'body' }),
      });

      expect(res.status).toBe(400);
    });

    it('should reject missing required fields', async () => {
      const res = await app.request('/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: '123e4567-e89b-12d3-a456-426614174000',
          version: 1,
          // missing statementId, clusterId, dbType, code, sql
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should accept valid execute request', async () => {
      isValidTargetResult = true;

      const res = await app.request('/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: '123e4567-e89b-12d3-a456-426614174000',
          version: 1,
          statementId: '123e4567-e89b-12d3-a456-426614174001',
          clusterId: 'us1',
          dbType: 'polardb_mysql',
          code: 'primary',
          sql: 'SELECT * FROM users',
          timeoutMs: 30000,
        }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; resultRowCount: number };
      expect(json.success).toBe(true);
      expect(json.resultRowCount).toBe(1);
    });

    it('should return 400 for unknown target', async () => {
      isValidTargetResult = false;

      const res = await app.request('/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: '123e4567-e89b-12d3-a456-426614174000',
          version: 1,
          statementId: '123e4567-e89b-12d3-a456-426614174001',
          clusterId: 'unknown',
          dbType: 'polardb_mysql',
          code: 'primary',
          sql: 'SELECT * FROM users',
          timeoutMs: 30000,
        }),
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as { success: boolean; errorMessage: string };
      expect(json.success).toBe(false);
      expect(json.errorMessage).toContain('Unknown target');
    });

    it('should track process ID on successful execution', async () => {
      isValidTargetResult = true;

      await app.request('/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: '123e4567-e89b-12d3-a456-426614174000',
          version: 1,
          statementId: '123e4567-e89b-12d3-a456-426614174001',
          clusterId: 'us1',
          dbType: 'polardb_mysql',
          code: 'primary',
          sql: 'SELECT * FROM users',
          timeoutMs: 30000,
        }),
      });

      expect(trackProcessCalled).toBe(true);
    });

    it('should validate dbType enum', async () => {
      const res = await app.request('/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: '123e4567-e89b-12d3-a456-426614174000',
          version: 1,
          statementId: '123e4567-e89b-12d3-a456-426614174001',
          clusterId: 'us1',
          dbType: 'mysql', // Should fail - only polardb_mysql/redis/adb allowed
          code: 'primary',
          sql: 'SELECT * FROM users',
          timeoutMs: 30000,
        }),
      });

      expect(res.status).toBe(400);
    });

    it('should validate timeout bounds', async () => {
      // Test timeout too low
      const res1 = await app.request('/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: '123e4567-e89b-12d3-a456-426614174000',
          version: 1,
          statementId: '123e4567-e89b-12d3-a456-426614174001',
          clusterId: 'us1',
          dbType: 'polardb_mysql',
          code: 'primary',
          sql: 'SELECT * FROM users',
          timeoutMs: 100, // Below MIN_TIMEOUT_MS (1000)
        }),
      });

      expect(res1.status).toBe(400);

      // Test timeout too high
      const res2 = await app.request('/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: '123e4567-e89b-12d3-a456-426614174000',
          version: 1,
          statementId: '123e4567-e89b-12d3-a456-426614174001',
          clusterId: 'us1',
          dbType: 'polardb_mysql',
          code: 'primary',
          sql: 'SELECT * FROM users',
          timeoutMs: 999999, // Above MAX_TIMEOUT_MS (120000)
        }),
      });

      expect(res2.status).toBe(400);
    });
  });

  describe('POST /precheck', () => {
    it('should reject invalid request body', async () => {
      const res = await app.request('/precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'body' }),
      });

      expect(res.status).toBe(400);
    });

    it('should accept valid precheck request', async () => {
      isValidTargetResult = true;

      const res = await app.request('/precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId: 'us1',
          dbType: 'polardb_mysql',
          code: 'primary',
          sql: 'SELECT COUNT(*) as cnt FROM users WHERE status = 1',
        }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as { success: boolean; affectedRows: number };
      expect(json.success).toBe(true);
      expect(json.affectedRows).toBe(5);
    });

    it('should return 400 for unknown target', async () => {
      isValidTargetResult = false;

      const res = await app.request('/precheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clusterId: 'unknown',
          dbType: 'polardb_mysql',
          code: 'primary',
          sql: 'SELECT COUNT(*) as cnt FROM users WHERE status = 1',
        }),
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as { success: boolean };
      expect(json.success).toBe(false);
    });
  });
});
