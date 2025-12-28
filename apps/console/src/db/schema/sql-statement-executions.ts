import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
  bigint,
} from 'drizzle-orm/pg-core';
import { executionStatus } from './enums';
import { sqlStatements } from './sql-statements';
import { profiles } from './profiles';
import { dbTargets } from './db-targets';

/**
 * SQL 语句执行历史表
 * 每次执行都会创建一条新记录，而不是覆盖更新
 */
export const sqlStatementExecutions = pgTable(
  'sql_statement_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    statementId: uuid('statement_id')
      .notNull()
      .references(() => sqlStatements.id),
    targetId: uuid('target_id').references(() => dbTargets.id),
    status: executionStatus('status').notNull(),
    result: jsonb('result'),
    processId: bigint('process_id', { mode: 'number' }),
    durationMs: integer('duration_ms'),
    executedBy: text('executed_by')
      .notNull()
      .references(() => profiles.id),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    errorMessage: text('error_message'),
  },
  (table) => [
    index('idx_executions_statement_id').on(table.statementId),
    index('idx_executions_target_id').on(table.targetId),
    index('idx_executions_started_at').on(table.startedAt),
  ]
);
