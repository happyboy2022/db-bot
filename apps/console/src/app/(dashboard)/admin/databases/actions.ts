'use server';

import { headers } from 'next/headers';
import { revalidatePath, revalidateTag } from 'next/cache';
import { getDb } from '@/db';
import { dbTargets, auditLogs, sqlRequests, clusters } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { eq, and, count } from 'drizzle-orm';
import { z } from 'zod';
import {
  DB_TARGET_TYPES,
  isValidDbTargetTypeKey,
  type DbTargetTypeKey,
  type ConfigCheckLevel,
  type DatabaseCheckResult,
  getClusterEnvironment,
  isDatabaseRequired,
  getDatabaseRequiredReason,
} from '@sql-ops/shared';
import {
  getClusterTargetDbStatus,
  testTargetDbConfig,
  clearTargetDbStatusCache,
  type ClusterTargetDbStatus,
} from '@/lib/doppler';
import { testDatabaseConnection } from '@/lib/executor/config-check';

interface ActionResult {
  success: boolean;
  error?: string;
  databaseId?: string;
}

// ============================================================================
// 固定化数据库类型验证
// ============================================================================

const createDatabaseSchema = z.object({
  clusterId: z.string().uuid('无效的集群 ID'),
  targetTypeKey: z.string().refine(
    (val) => isValidDbTargetTypeKey(val),
    { message: '无效的数据库目标类型' }
  ),
});

// ============================================================================
// 数据库 CRUD 操作
// ============================================================================

/**
 * 创建新数据库（固定化类型）
 *
 * 参数:
 * - clusterId: 集群 ID
 * - targetTypeKey: 目标类型 key（如 polardb_mysql_primary、adb、redis）
 *
 * code 和 displayName 根据 targetTypeKey 自动派生
 */
export async function createDatabase(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Parse and validate input
    const rawData = {
      clusterId: (formData.get('clusterId') as string)?.trim(),
      targetTypeKey: (formData.get('targetTypeKey') as string)?.trim(),
    };

    const validated = createDatabaseSchema.parse(rawData);

    // 获取目标类型配置
    const targetConfig = DB_TARGET_TYPES[validated.targetTypeKey as DbTargetTypeKey];
    if (!targetConfig) {
      return { success: false, error: '无效的数据库目标类型' };
    }

    // Check if cluster exists
    const [cluster] = await getDb()
      .select({ id: clusters.id, name: clusters.name })
      .from(clusters)
      .where(eq(clusters.id, validated.clusterId))
      .limit(1);

    if (!cluster) {
      return { success: false, error: '集群不存在' };
    }

    // Check if this target type already exists in this cluster
    // 使用 dbType + code 组合来检查唯一性
    const [existing] = await getDb()
      .select({ id: dbTargets.id })
      .from(dbTargets)
      .where(
        and(
          eq(dbTargets.clusterId, validated.clusterId),
          eq(dbTargets.dbType, targetConfig.dbType),
          eq(dbTargets.code, targetConfig.code)
        )
      )
      .limit(1);

    if (existing) {
      return {
        success: false,
        error: `该集群下已存在 ${targetConfig.displayName}`,
      };
    }

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    const result = await getDb().transaction(async (tx) => {
      // Create database with fixed code and displayName
      const [database] = await tx
        .insert(dbTargets)
        .values({
          clusterId: validated.clusterId,
          dbType: targetConfig.dbType,
          code: targetConfig.code,
          displayName: targetConfig.displayName,
          enabled: true,
          createdBy: admin.id,
        })
        .returning({ id: dbTargets.id, code: dbTargets.code });

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'database.create',
        targetType: 'database',
        targetId: database.id,
        payload: {
          clusterId: validated.clusterId,
          clusterName: cluster.name,
          targetTypeKey: validated.targetTypeKey,
          dbType: targetConfig.dbType,
          code: targetConfig.code,
          displayName: targetConfig.displayName,
          envVar: targetConfig.envVar,
        },
        ipAddress,
        userAgent,
      });

      return database;
    });

    revalidatePath('/admin/databases');
    revalidateTag('db-targets');
    return { success: true, databaseId: result.id };
  } catch (error) {
    console.error('Failed to create database:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '创建数据库失败',
    };
  }
}

/**
 * 切换数据库启用状态
 */
export async function toggleDatabase(
  databaseId: string,
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
        .update(dbTargets)
        .set({
          enabled,
          updatedAt: new Date(),
        })
        .where(eq(dbTargets.id, databaseId));

      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: enabled ? 'database.enable' : 'database.disable',
        targetType: 'database',
        targetId: databaseId,
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/databases');
    revalidateTag('db-targets');
    return { success: true };
  } catch (error) {
    console.error('Failed to toggle database:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '切换数据库状态失败',
    };
  }
}

/**
 * 删除数据库（需要输入确认码）
 */
export async function deleteDatabase(
  databaseId: string,
  confirmationCode: string
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Get database info
    const [database] = await getDb()
      .select({
        id: dbTargets.id,
        clusterId: dbTargets.clusterId,
        code: dbTargets.code,
        displayName: dbTargets.displayName,
        dbType: dbTargets.dbType,
      })
      .from(dbTargets)
      .where(eq(dbTargets.id, databaseId))
      .limit(1);

    if (!database) {
      return { success: false, error: '数据库不存在' };
    }

    // Verify confirmation code
    if (confirmationCode !== database.code) {
      return { success: false, error: '确认码不正确，请输入数据库代号' };
    }

    // Check if there are associated sql_requests
    const [requestCount] = await getDb()
      .select({ count: count() })
      .from(sqlRequests)
      .where(eq(sqlRequests.targetId, databaseId));

    if ((requestCount?.count ?? 0) > 0) {
      return {
        success: false,
        error: `该数据库有 ${requestCount?.count} 个关联的 SQL 请求，无法删除`,
      };
    }

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    await getDb().transaction(async (tx) => {
      // Delete database
      await tx.delete(dbTargets).where(eq(dbTargets.id, databaseId));

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'database.delete',
        targetType: 'database',
        targetId: databaseId,
        payload: {
          clusterId: database.clusterId,
          code: database.code,
          displayName: database.displayName,
          dbType: database.dbType,
        },
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/databases');
    revalidateTag('db-targets');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete database:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除数据库失败',
    };
  }
}

// ============================================================================
// 目标数据库配置检测
// ============================================================================

/**
 * 获取集群的目标数据库配置状态
 */
export async function getClusterTargetDbStatusAction(
  clusterName: string
): Promise<{
  success: boolean;
  status?: ClusterTargetDbStatus;
  error?: string;
}> {
  try {
    await requireAdmin();
    const status = await getClusterTargetDbStatus(clusterName);
    return { success: true, status };
  } catch (error) {
    console.error('Failed to get cluster target DB status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取配置状态失败',
    };
  }
}

/**
 * 测试特定数据库目标的配置
 */
export async function testDatabaseConfigAction(
  clusterName: string,
  targetTypeKey: string
): Promise<{
  success: boolean;
  configured: boolean;
  maskedUrl?: string;
  error?: string;
}> {
  try {
    await requireAdmin();

    if (!isValidDbTargetTypeKey(targetTypeKey)) {
      return {
        success: false,
        configured: false,
        error: '无效的目标类型',
      };
    }

    const result = await testTargetDbConfig(
      clusterName,
      targetTypeKey as DbTargetTypeKey
    );

    return result;
  } catch (error) {
    console.error('Failed to test database config:', error);
    return {
      success: false,
      configured: false,
      error: error instanceof Error ? error.message : '测试失败',
    };
  }
}

/**
 * 刷新集群的目标数据库配置缓存
 */
export async function refreshTargetDbCacheAction(
  clusterName?: string
): Promise<ActionResult> {
  try {
    await requireAdmin();
    clearTargetDbStatusCache(clusterName);
    return { success: true };
  } catch (error) {
    console.error('Failed to refresh target DB cache:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '刷新缓存失败',
    };
  }
}

// ============================================================================
// 辅助函数：获取集群中已添加的数据库类型
// ============================================================================

/**
 * 获取集群中已添加的数据库目标类型 key 列表
 */
export async function getExistingTargetTypes(
  clusterId: string
): Promise<DbTargetTypeKey[]> {
  const existingDbs = await getDb()
    .select({
      dbType: dbTargets.dbType,
      code: dbTargets.code,
    })
    .from(dbTargets)
    .where(eq(dbTargets.clusterId, clusterId));

  // 将 dbType + code 映射回 targetTypeKey
  const existingKeys: DbTargetTypeKey[] = [];
  for (const db of existingDbs) {
    for (const [key, config] of Object.entries(DB_TARGET_TYPES)) {
      if (config.dbType === db.dbType && config.code === db.code) {
        existingKeys.push(key as DbTargetTypeKey);
        break;
      }
    }
  }

  return existingKeys;
}

// ============================================================================
// 数据库配置检测（通过 Executor）
// ============================================================================

/**
 * 检测单个数据库的配置状态
 * 包括配置检查和可选的连接测试
 *
 * @param databaseId 数据库 ID
 * @param checkLevel 检测级别: 'config' 仅检查配置, 'connection' 包含连接测试
 */
export async function checkDatabaseConfig(
  databaseId: string,
  checkLevel: ConfigCheckLevel = 'connection'
): Promise<{
  success: boolean;
  result?: DatabaseCheckResult;
  error?: string;
}> {
  try {
    await requireAdmin();

    // 获取数据库信息
    const [database] = await getDb()
      .select({
        id: dbTargets.id,
        clusterId: dbTargets.clusterId,
        dbType: dbTargets.dbType,
        code: dbTargets.code,
        displayName: dbTargets.displayName,
      })
      .from(dbTargets)
      .where(eq(dbTargets.id, databaseId))
      .limit(1);

    if (!database) {
      return { success: false, error: '数据库不存在' };
    }

    // 获取集群信息
    const [cluster] = await getDb()
      .select({
        id: clusters.id,
        name: clusters.name,
        displayName: clusters.displayName,
      })
      .from(clusters)
      .where(eq(clusters.id, database.clusterId))
      .limit(1);

    if (!cluster) {
      return { success: false, error: '集群不存在' };
    }

    // 获取目标类型 key
    let targetTypeKey: DbTargetTypeKey | null = null;
    let targetConfig = null;
    for (const [key, config] of Object.entries(DB_TARGET_TYPES)) {
      if (config.dbType === database.dbType && config.code === database.code) {
        targetTypeKey = key as DbTargetTypeKey;
        targetConfig = config;
        break;
      }
    }

    if (!targetTypeKey || !targetConfig) {
      return { success: false, error: '无效的数据库类型配置' };
    }

    // 获取环境类型和必需性
    const environment = getClusterEnvironment(cluster.name);
    const isRequired = isDatabaseRequired(targetTypeKey, environment);
    const requiredReason = getDatabaseRequiredReason(targetTypeKey);

    // 从 Doppler 获取配置状态
    const targetDbStatus = await getClusterTargetDbStatus(cluster.name);
    const envVarKey = targetConfig.envVar as keyof typeof targetDbStatus.databases;
    const dbUrlStatus = targetDbStatus.databases[envVarKey];
    const configured = dbUrlStatus?.configured || false;

    // 构建检测结果
    const result: DatabaseCheckResult = {
      targetTypeKey,
      displayName: targetConfig.displayName,
      envVar: targetConfig.envVar,
      configStatus: {
        key: `db_config_${targetTypeKey}`,
        name: `${targetConfig.displayName} 配置`,
        status: configured ? 'success' : isRequired ? 'error' : 'warning',
        message: configured
          ? '已配置'
          : isRequired
            ? `必须配置（${requiredReason}）`
            : '未配置（可选）',
        maskedUrl: dbUrlStatus?.maskedUrl,
        required: isRequired,
      },
      required: isRequired,
      requiredReason: isRequired ? requiredReason : undefined,
    };

    // 如果配置了且需要连接测试
    if (configured && checkLevel === 'connection') {
      const connectionResult = await testDatabaseConnection(
        cluster.name,
        targetTypeKey
      );

      result.connectionStatus = {
        key: `db_connection_${targetTypeKey}`,
        name: `${targetConfig.displayName} 连接测试`,
        status: connectionResult.success ? 'success' : 'error',
        message: connectionResult.message,
        latencyMs: connectionResult.latencyMs,
        required: false,
      };
    }

    return { success: true, result };
  } catch (error) {
    console.error('Failed to check database config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '配置检测失败',
    };
  }
}

/**
 * 批量检测集群下所有数据库的配置状态
 *
 * @param clusterId 集群 ID
 * @param checkLevel 检测级别
 */
export async function checkClusterDatabasesConfig(
  clusterId: string,
  checkLevel: ConfigCheckLevel = 'connection'
): Promise<{
  success: boolean;
  results?: DatabaseCheckResult[];
  clusterName?: string;
  environment?: string;
  error?: string;
}> {
  try {
    await requireAdmin();

    // 获取集群信息
    const [cluster] = await getDb()
      .select({
        id: clusters.id,
        name: clusters.name,
        displayName: clusters.displayName,
      })
      .from(clusters)
      .where(eq(clusters.id, clusterId))
      .limit(1);

    if (!cluster) {
      return { success: false, error: '集群不存在' };
    }

    // 获取环境类型
    const environment = getClusterEnvironment(cluster.name);

    // 获取集群下的所有数据库
    const databases = await getDb()
      .select({
        id: dbTargets.id,
        dbType: dbTargets.dbType,
        code: dbTargets.code,
        displayName: dbTargets.displayName,
      })
      .from(dbTargets)
      .where(eq(dbTargets.clusterId, clusterId));

    // 从 Doppler 获取配置状态
    const targetDbStatus = await getClusterTargetDbStatus(cluster.name);

    const results: DatabaseCheckResult[] = [];

    for (const database of databases) {
      // 获取目标类型 key
      let targetTypeKey: DbTargetTypeKey | null = null;
      let targetConfig = null;
      for (const [key, config] of Object.entries(DB_TARGET_TYPES)) {
        if (config.dbType === database.dbType && config.code === database.code) {
          targetTypeKey = key as DbTargetTypeKey;
          targetConfig = config;
          break;
        }
      }

      if (!targetTypeKey || !targetConfig) {
        continue;
      }

      const isRequired = isDatabaseRequired(targetTypeKey, environment);
      const requiredReason = getDatabaseRequiredReason(targetTypeKey);

      const envVarKey = targetConfig.envVar as keyof typeof targetDbStatus.databases;
      const dbUrlStatus = targetDbStatus.databases[envVarKey];
      const configured = dbUrlStatus?.configured || false;

      const result: DatabaseCheckResult = {
        targetTypeKey,
        displayName: targetConfig.displayName,
        envVar: targetConfig.envVar,
        configStatus: {
          key: `db_config_${targetTypeKey}`,
          name: `${targetConfig.displayName} 配置`,
          status: configured ? 'success' : isRequired ? 'error' : 'warning',
          message: configured
            ? '已配置'
            : isRequired
              ? `必须配置（${requiredReason}）`
              : '未配置（可选）',
          maskedUrl: dbUrlStatus?.maskedUrl,
          required: isRequired,
        },
        required: isRequired,
        requiredReason: isRequired ? requiredReason : undefined,
      };

      // 如果配置了且需要连接测试
      if (configured && checkLevel === 'connection') {
        const connectionResult = await testDatabaseConnection(
          cluster.name,
          targetTypeKey
        );

        result.connectionStatus = {
          key: `db_connection_${targetTypeKey}`,
          name: `${targetConfig.displayName} 连接测试`,
          status: connectionResult.success ? 'success' : 'error',
          message: connectionResult.message,
          latencyMs: connectionResult.latencyMs,
          required: false,
        };
      }

      results.push(result);
    }

    return {
      success: true,
      results,
      clusterName: cluster.name,
      environment,
    };
  } catch (error) {
    console.error('Failed to check cluster databases config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '配置检测失败',
    };
  }
}
