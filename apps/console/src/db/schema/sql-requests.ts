import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { requestStatus } from './enums';
import { dbTargets } from './db-targets';
import { profiles } from './profiles';

export const sqlRequests = pgTable(
  'sql_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    targetId: uuid('target_id')
      .notNull()
      .references(() => dbTargets.id),
    createdBy: text('created_by')
      .notNull()
      .references(() => profiles.id),
    title: text('title').notNull(),
    description: text('description'),
    status: requestStatus('status').notNull().default('PENDING_APPROVAL'),
    currentVersionId: uuid('current_version_id'),
    approvedVersionId: uuid('approved_version_id'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_requests_created_by').on(table.createdBy),
    index('idx_requests_status').on(table.status),
    index('idx_requests_target_id').on(table.targetId),
  ]
);
