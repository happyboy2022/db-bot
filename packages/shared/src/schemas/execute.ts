import { z } from 'zod';
import { MAX_TIMEOUT_MS, MIN_TIMEOUT_MS, DEFAULT_TIMEOUT_MS } from '../constants/limits';
import { DB_TYPES, DEFAULT_DB_TYPE } from '../constants/db-types';

/**
 * Schema for database type validation
 */
export const dbTypeSchema = z.enum(DB_TYPES);

/**
 * Schema for database type with default value
 */
export const dbTypeWithDefaultSchema = dbTypeSchema.default(DEFAULT_DB_TYPE);

/**
 * Schema for execute request payload
 *
 * ## Security Notes
 *
 * ### Request ID Validation
 * The `requestId` field links the execution to a validated SQL request in the Console.
 * Console is responsible for verifying:
 * - The request exists in the database
 * - The request status allows execution (APPROVED or FAILED for retry)
 * - The statement belongs to the specified request and version
 * - The executing user has permission to run the request
 *
 * ### Statement Ownership Validation
 * Console validates statement ownership by checking:
 * 1. Statement exists with the given `statementId`
 * 2. Statement's `versionId` matches a version with the correct `requestId` and `version` number
 * 3. Statement has not already been successfully executed (for non-retryable statements)
 *
 * ### Executor Trust Model
 * Executor trusts that Console has performed these validations.
 * The HMAC signature ensures requests originate from a trusted Console instance.
 * Executor focuses on:
 * - SQL execution against the target database
 * - Process ID tracking for termination capability
 * - Result streaming and timeout management
 */
export const executeRequestSchema = z.object({
  requestId: z.string().uuid(),
  version: z.number().int().positive(),
  statementId: z.string().uuid(),
  clusterId: z.string().min(1),
  dbType: dbTypeSchema,
  code: z.string().min(1),
  sql: z.string().min(1),
  timeoutMs: z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
});

export type ExecuteRequest = z.infer<typeof executeRequestSchema>;

/**
 * Result preview schema for SELECT statements
 */
export const resultPreviewSchema = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.record(z.unknown())),
  truncated: z.boolean(),
});

/**
 * Schema for execute response
 */
export const executeResponseSchema = z.object({
  success: z.boolean(),
  statementId: z.string().uuid(),
  processId: z.number().int().nullable().optional(),
  affectedRows: z.number().int().nullable(),
  resultRowCount: z.number().int().nullable(),
  resultPreview: resultPreviewSchema.nullable(),
  durationMs: z.number().int(),
  errorMessage: z.string().nullable(),
});

export type ExecuteResponse = z.infer<typeof executeResponseSchema>;

/**
 * Schema for pre-check request payload
 */
export const preCheckRequestSchema = z.object({
  clusterId: z.string().min(1),
  dbType: dbTypeSchema,
  code: z.string().min(1),
  sql: z.string().min(1),
});

export type PreCheckRequest = z.infer<typeof preCheckRequestSchema>;

/**
 * Schema for pre-check response
 */
export const preCheckResponseSchema = z.object({
  success: z.boolean(),
  affectedRows: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
});

export type PreCheckResponse = z.infer<typeof preCheckResponseSchema>;
