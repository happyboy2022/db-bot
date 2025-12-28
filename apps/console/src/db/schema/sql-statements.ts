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
import { statementType, statementStatus } from './enums';
import { sqlRequestVersions } from './sql-request-versions';
import { profiles } from './profiles';

export const sqlStatements = pgTable(
  'sql_statements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => sqlRequestVersions.id),
    orderIndex: integer('order_index').notNull(),
    sqlText: text('sql_text').notNull(),
    type: statementType('type').notNull(),
    precheckSql: text('precheck_sql'),
    validationResult: jsonb('validation_result').notNull(),
    execStatus: statementStatus('exec_status'),
    execResult: jsonb('exec_result'),
    processId: bigint('process_id', { mode: 'number' }),
    durationMs: integer('duration_ms'),
    executedBy: text('executed_by').references(() => profiles.id, {
      onDelete: 'set null',
    }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
  },
  (table) => [index('idx_statements_version_id').on(table.versionId)]
);
