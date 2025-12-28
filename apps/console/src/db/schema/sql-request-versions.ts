import { pgTable, uuid, text, timestamp, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { sqlRequests } from './sql-requests';
import { profiles } from './profiles';

export const sqlRequestVersions = pgTable(
  'sql_request_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => sqlRequests.id),
    version: integer('version').notNull(),
    sqlRaw: text('sql_raw').notNull(),
    validationResult: jsonb('validation_result').notNull(),
    templateId: uuid('template_id'),
    templateSnapshot: jsonb('template_snapshot'),
    createdBy: text('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_versions_request_id').on(table.requestId)]
);
