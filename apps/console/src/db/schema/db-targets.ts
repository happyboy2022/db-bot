import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { dbType } from './enums';
import { clusters } from './clusters';
import { profiles } from './profiles';

/**
 * 数据库目标表
 *
 * 注意：从固定化重构后，每个集群每种 (dbType, code) 组合只能有一个实例
 * code 和 displayName 都是根据 dbType 自动派生的固定值
 *
 * 固定的 code 值：
 * - polardb_mysql: primary, read_only, record
 * - adb: adb
 * - redis: redis
 */
export const dbTargets = pgTable(
  'db_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clusterId: uuid('cluster_id')
      .notNull()
      .references(() => clusters.id),
    /** 数据库大类型 */
    dbType: dbType('db_type').notNull(),
    /**
     * 数据库代号（固定值）
     * - polardb_mysql: primary | read_only | record
     * - adb: adb
     * - redis: redis
     */
    code: text('code').notNull(),
    /**
     * 显示名称（固定值，根据 dbType 和 code 自动派生）
     * 保留此字段用于向后兼容，应用层会使用固定值覆盖
     */
    displayName: text('display_name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: text('created_by')
      .notNull()
      .references(() => profiles.id),
  },
  (table) => [
    index('idx_db_targets_cluster_id').on(table.clusterId),
    index('idx_db_targets_cluster_code').on(table.clusterId, table.code),
    index('idx_db_targets_enabled').on(table.enabled),
    // 唯一约束：每个集群每种 (dbType, code) 组合只能有一个实例
    uniqueIndex('idx_db_targets_cluster_type_code_unique').on(
      table.clusterId,
      table.dbType,
      table.code
    ),
  ]
);
