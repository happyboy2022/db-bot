import { unstable_cache } from 'next/cache';
import { getDb } from '@/db';
import { sqlTemplates, profiles } from '@/db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

export interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
  dbType: string;
  tags: string[] | null;
  sqlText: string;
}

export interface AdminTemplate {
  id: string;
  name: string;
  description: string | null;
  dbType: string;
  tags: string[] | null;
  sqlText: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  creator: {
    email: string;
    displayName: string | null;
  } | null;
}

/**
 * Get all enabled templates (with 5 minute cache)
 */
export const getTemplates = unstable_cache(
  async (): Promise<TemplateOption[]> => {
    const result = await getDb()
      .select({
        id: sqlTemplates.id,
        name: sqlTemplates.name,
        description: sqlTemplates.description,
        dbType: sqlTemplates.dbType,
        tags: sqlTemplates.tags,
        sqlText: sqlTemplates.sqlText,
      })
      .from(sqlTemplates)
      .where(eq(sqlTemplates.enabled, true))
      .orderBy(sqlTemplates.name);

    return result;
  },
  ['templates-list'],
  { revalidate: 300, tags: ['templates'] }
);

/**
 * Get templates filtered by DB type (直接在数据库过滤，with 5 minute cache)
 */
export const getTemplatesByDbType = unstable_cache(
  async (dbType: string): Promise<TemplateOption[]> => {
    const result = await getDb()
      .select({
        id: sqlTemplates.id,
        name: sqlTemplates.name,
        description: sqlTemplates.description,
        dbType: sqlTemplates.dbType,
        tags: sqlTemplates.tags,
        sqlText: sqlTemplates.sqlText,
      })
      .from(sqlTemplates)
      .where(and(
        eq(sqlTemplates.enabled, true),
        sql`${sqlTemplates.dbType}::text = ${dbType}`
      ))
      .orderBy(sqlTemplates.name);

    return result;
  },
  ['templates-by-dbtype'],
  { revalidate: 300, tags: ['templates'] }
);

/**
 * Get all templates for admin (including disabled)
 */
export async function getAllTemplatesForAdmin(): Promise<AdminTemplate[]> {
  const result = await getDb()
    .select({
      id: sqlTemplates.id,
      name: sqlTemplates.name,
      description: sqlTemplates.description,
      dbType: sqlTemplates.dbType,
      tags: sqlTemplates.tags,
      sqlText: sqlTemplates.sqlText,
      enabled: sqlTemplates.enabled,
      createdAt: sqlTemplates.createdAt,
      updatedAt: sqlTemplates.updatedAt,
      createdBy: sqlTemplates.createdBy,
      creator: {
        email: profiles.email,
        displayName: profiles.displayName,
      },
    })
    .from(sqlTemplates)
    .leftJoin(profiles, eq(sqlTemplates.createdBy, profiles.id))
    .orderBy(desc(sqlTemplates.updatedAt));

  return result as AdminTemplate[];
}

/**
 * Get a single template by ID
 */
export async function getTemplateById(id: string): Promise<AdminTemplate | null> {
  const [template] = await getDb()
    .select({
      id: sqlTemplates.id,
      name: sqlTemplates.name,
      description: sqlTemplates.description,
      dbType: sqlTemplates.dbType,
      tags: sqlTemplates.tags,
      sqlText: sqlTemplates.sqlText,
      enabled: sqlTemplates.enabled,
      createdAt: sqlTemplates.createdAt,
      updatedAt: sqlTemplates.updatedAt,
      createdBy: sqlTemplates.createdBy,
      creator: {
        email: profiles.email,
        displayName: profiles.displayName,
      },
    })
    .from(sqlTemplates)
    .leftJoin(profiles, eq(sqlTemplates.createdBy, profiles.id))
    .where(eq(sqlTemplates.id, id))
    .limit(1);

  return template as AdminTemplate | null;
}
