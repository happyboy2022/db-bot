import {
  pgTable,
  uuid,
  timestamp,
  integer,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { statementStatus } from './enums';
import { sqlRequests } from './sql-requests';
import { dbTargets } from './db-targets';

/**
 * SQL 请求目标关联表
 * 支持一个请求关联多个数据库目标
 */
export const sqlRequestTargets = pgTable(
  'sql_request_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => sqlRequests.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => dbTargets.id),
    orderIndex: integer('order_index').notNull().default(0),
    execStatus: statementStatus('exec_status'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_request_targets_request').on(table.requestId),
    index('idx_request_targets_target').on(table.targetId),
    unique('uq_request_target').on(table.requestId, table.targetId),
  ]
);
