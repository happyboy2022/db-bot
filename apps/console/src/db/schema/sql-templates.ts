import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { dbType } from './enums';
import { profiles } from './profiles';

export const sqlTemplates = pgTable('sql_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description'),
  dbType: dbType('db_type').notNull(),
  tags: text('tags').array(),
  sqlText: text('sql_text').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdBy: text('created_by')
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
