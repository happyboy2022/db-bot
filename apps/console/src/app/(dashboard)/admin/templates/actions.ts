'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { sqlTemplates, auditLogs } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

interface ActionResult {
  success: boolean;
  error?: string;
  templateId?: string;
}

const templateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  dbType: z.enum(['polardb_mysql']),
  tags: z.array(z.string()).optional(),
  sqlText: z.string().min(1, 'SQL is required'),
});

/**
 * Create a new template
 */
export async function createTemplate(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Parse and validate input
    const rawData = {
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || undefined,
      dbType: formData.get('dbType') as string,
      tags: (formData.get('tags') as string)
        ?.split(',')
        .map((t) => t.trim())
        .filter(Boolean) || [],
      sqlText: formData.get('sqlText') as string,
    };

    const validated = templateSchema.parse(rawData);

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    const result = await getDb().transaction(async (tx) => {
      // Create template
      const [template] = await tx
        .insert(sqlTemplates)
        .values({
          name: validated.name,
          description: validated.description || null,
          dbType: validated.dbType as 'polardb_mysql',
          tags: validated.tags,
          sqlText: validated.sqlText,
          enabled: true,
          createdBy: admin.id,
        })
        .returning({ id: sqlTemplates.id, name: sqlTemplates.name });

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'template.create',
        targetType: 'template',
        targetId: template.id,
        payload: { name: template.name },
        ipAddress,
        userAgent,
      });

      return template;
    });

    revalidatePath('/admin/templates');
    return { success: true, templateId: result.id };
  } catch (error) {
    console.error('Failed to create template:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create template',
    };
  }
}

/**
 * Update an existing template
 */
export async function updateTemplate(
  templateId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Parse and validate input
    const rawData = {
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || undefined,
      dbType: formData.get('dbType') as string,
      tags: (formData.get('tags') as string)
        ?.split(',')
        .map((t) => t.trim())
        .filter(Boolean) || [],
      sqlText: formData.get('sqlText') as string,
    };

    const validated = templateSchema.parse(rawData);

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    await getDb().transaction(async (tx) => {
      // Update template
      await tx
        .update(sqlTemplates)
        .set({
          name: validated.name,
          description: validated.description || null,
          dbType: validated.dbType as 'polardb_mysql',
          tags: validated.tags,
          sqlText: validated.sqlText,
          updatedAt: new Date(),
        })
        .where(eq(sqlTemplates.id, templateId));

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'template.update',
        targetType: 'template',
        targetId: templateId,
        payload: { name: validated.name },
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/templates');
    return { success: true };
  } catch (error) {
    console.error('Failed to update template:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update template',
    };
  }
}

/**
 * Toggle template enabled status
 */
export async function toggleTemplate(
  templateId: string,
  enabled: boolean
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    await getDb().transaction(async (tx) => {
      await tx
        .update(sqlTemplates)
        .set({
          enabled,
          updatedAt: new Date(),
        })
        .where(eq(sqlTemplates.id, templateId));

      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: enabled ? 'template.enable' : 'template.disable',
        targetType: 'template',
        targetId: templateId,
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/templates');
    return { success: true };
  } catch (error) {
    console.error('Failed to toggle template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle template',
    };
  }
}

/**
 * Delete a template (soft delete by disabling)
 */
export async function deleteTemplate(templateId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    await getDb().transaction(async (tx) => {
      // Soft delete by disabling and renaming
      await tx
        .update(sqlTemplates)
        .set({
          enabled: false,
          name: sql`${sqlTemplates.name} || ' [DELETED]'`,
          updatedAt: new Date(),
        })
        .where(eq(sqlTemplates.id, templateId));

      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'template.delete',
        targetType: 'template',
        targetId: templateId,
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/templates');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete template',
    };
  }
}
