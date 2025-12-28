import { z } from 'zod';
import { dbTypeSchema, dbTypeWithDefaultSchema } from './execute';

/**
 * Tracker mode - indicates whether Redis or memory is used for process tracking
 */
export const trackerModeSchema = z.enum(['redis', 'memory', 'unknown']);

export type TrackerMode = z.infer<typeof trackerModeSchema>;

/**
 * Session target - identifies a specific database target
 */
export const sessionTargetSchema = z.object({
  clusterId: z.string(),
  dbType: dbTypeSchema,
  code: z.string(),
});

export type SessionTarget = z.infer<typeof sessionTargetSchema>;

/**
 * Session info - represents an active database session
 */
export const sessionInfoSchema = z.object({
  id: z.number().int(),
  user: z.string(),
  host: z.string(),
  db: z.string().nullable(),
  command: z.string(),
  time: z.number().int(),
  state: z.string().nullable(),
  info: z.string().nullable(),
  isSystemOwned: z.boolean(),
  statementId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
});

export type SessionInfo = z.infer<typeof sessionInfoSchema>;

/**
 * Session filter options - controls which sessions to display
 */
export const sessionFilterOptionsSchema = z.object({
  /** Only show sessions for the configured database user (from connection string) */
  filterByConfiguredUser: z.coerce.boolean().optional().default(true),
  /** Exclude idle sessions (Sleep, Binlog Dump, Connect, Daemon, etc.) */
  excludeIdleSessions: z.coerce.boolean().optional().default(true),
});

export type SessionFilterOptions = z.infer<typeof sessionFilterOptionsSchema>;

/**
 * Idle/system command types that should be excluded when excludeIdleSessions is true
 */
export const IDLE_COMMANDS = [
  'Sleep',
  'Binlog Dump',
  'Binlog Dump GTID',
  'Connect',
  'Daemon',
  'Delayed insert',
  'Table Dump',
  'Change user',
] as const;

/**
 * Get sessions request query parameters
 */
export const getSessionsQuerySchema = z.object({
  clusterId: z.string().min(1),
  dbType: dbTypeWithDefaultSchema,
  code: z.string().min(1),
  // Filter options
  filterByConfiguredUser: z.coerce.boolean().optional().default(true),
  excludeIdleSessions: z.coerce.boolean().optional().default(true),
});

export type GetSessionsQuery = z.infer<typeof getSessionsQuerySchema>;

/**
 * Session filter statistics - shows what was filtered out
 */
export const sessionFilterStatsSchema = z.object({
  totalFromDb: z.number().int(),
  afterUserFilter: z.number().int(),
  afterIdleFilter: z.number().int(),
  filteredByUser: z.number().int(),
  filteredByIdle: z.number().int(),
});

export type SessionFilterStats = z.infer<typeof sessionFilterStatsSchema>;

/**
 * Get sessions response
 */
export const getSessionsResponseSchema = z.object({
  success: z.boolean(),
  sessions: z.array(sessionInfoSchema).optional(),
  count: z.number().int().optional(),
  target: sessionTargetSchema.optional(),
  trackerMode: trackerModeSchema.optional(),
  /** The configured database user from connection string */
  configuredUser: z.string().optional(),
  /** Filter statistics showing what was filtered out */
  filterStats: sessionFilterStatsSchema.optional(),
  /** Applied filter options */
  appliedFilters: sessionFilterOptionsSchema.optional(),
  error: z.string().optional(),
});

export type GetSessionsResponse = z.infer<typeof getSessionsResponseSchema>;

/**
 * Get session targets response
 */
export const getSessionTargetsResponseSchema = z.object({
  success: z.boolean(),
  targets: z.array(sessionTargetSchema).optional(),
  trackerMode: trackerModeSchema.optional(),
  error: z.string().optional(),
});

export type GetSessionTargetsResponse = z.infer<typeof getSessionTargetsResponseSchema>;

/**
 * Kill session request body
 */
export const killSessionRequestSchema = z.object({
  clusterId: z.string().min(1),
  dbType: dbTypeWithDefaultSchema,
  code: z.string().min(1),
  processId: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});

export type KillSessionRequest = z.infer<typeof killSessionRequestSchema>;

/**
 * Kill session response
 */
export const killSessionResponseSchema = z.object({
  success: z.boolean(),
  killed: z.boolean().optional(),
  processId: z.number().int().optional(),
  wasSystemOwned: z.boolean().optional(),
  message: z.string().optional(),
  reason: z.string().optional(),
  trackerMode: trackerModeSchema.optional(),
  error: z.string().optional(),
});

export type KillSessionResponse = z.infer<typeof killSessionResponseSchema>;
