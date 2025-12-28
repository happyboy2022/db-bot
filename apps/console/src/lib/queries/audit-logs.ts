import { getDb } from '@/db';
import { auditLogs, profiles } from '@/db/schema';
import { desc, eq, and, gte, lte, count, SQL } from 'drizzle-orm';

export interface AuditLog {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  actor: {
    email: string;
    displayName: string | null;
  } | null;
}

export interface AuditFilters {
  action?: string | null;
  actorUserId?: string | null;
  targetType?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  page?: number;
  pageSize?: number;
}

export interface PaginatedAuditLogs {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Get audit logs with filtering and pagination
 */
export async function getAuditLogs(filters: AuditFilters = {}): Promise<PaginatedAuditLogs> {
  const { action, actorUserId, targetType, startDate, endDate, page = 1, pageSize = 50 } = filters;
  const offset = (page - 1) * pageSize;

  // Build where conditions
  const conditions: SQL<unknown>[] = [];

  if (action) {
    conditions.push(eq(auditLogs.action, action));
  }

  if (actorUserId) {
    conditions.push(eq(auditLogs.actorUserId, actorUserId));
  }

  if (targetType) {
    conditions.push(eq(auditLogs.targetType, targetType));
  }

  if (startDate) {
    conditions.push(gte(auditLogs.createdAt, startDate));
  }

  if (endDate) {
    conditions.push(lte(auditLogs.createdAt, endDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [countResult] = await getDb()
    .select({ count: count() })
    .from(auditLogs)
    .where(whereClause);

  const total = countResult?.count ?? 0;

  // Get logs with actor info
  const logs = await getDb()
    .select({
      id: auditLogs.id,
      actorUserId: auditLogs.actorUserId,
      action: auditLogs.action,
      targetType: auditLogs.targetType,
      targetId: auditLogs.targetId,
      payload: auditLogs.payload,
      ipAddress: auditLogs.ipAddress,
      userAgent: auditLogs.userAgent,
      createdAt: auditLogs.createdAt,
      actor: {
        email: profiles.email,
        displayName: profiles.displayName,
      },
    })
    .from(auditLogs)
    .leftJoin(profiles, eq(auditLogs.actorUserId, profiles.id))
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    logs: logs as AuditLog[],
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

/**
 * Get unique action types for filtering
 */
export async function getUniqueActions(): Promise<string[]> {
  const result = await getDb()
    .selectDistinct({ action: auditLogs.action })
    .from(auditLogs)
    .orderBy(auditLogs.action);

  return result.map((r) => r.action);
}

/**
 * Get unique target types for filtering
 */
export async function getUniqueTargetTypes(): Promise<string[]> {
  const result = await getDb()
    .selectDistinct({ targetType: auditLogs.targetType })
    .from(auditLogs)
    .orderBy(auditLogs.targetType);

  return result.map((r) => r.targetType);
}
