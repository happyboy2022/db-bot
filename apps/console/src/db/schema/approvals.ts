import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { approvalDecision } from './enums';
import { sqlRequests } from './sql-requests';
import { sqlRequestVersions } from './sql-request-versions';
import { profiles } from './profiles';

export const approvals = pgTable(
  'approvals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => sqlRequests.id),
    versionId: uuid('version_id')
      .notNull()
      .references(() => sqlRequestVersions.id),
    decision: approvalDecision('decision').notNull(),
    comment: text('comment'),
    decidedBy: text('decided_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_approvals_request_id').on(table.requestId)]
);
