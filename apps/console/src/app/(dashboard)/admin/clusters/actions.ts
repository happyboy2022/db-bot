'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/db';
import { clusters, auditLogs, dbTargets } from '@/db/schema';
import { requireAdmin } from '@/lib/auth';
import { eq, count } from 'drizzle-orm';
import { z } from 'zod';
import {
  checkClusterEnvStatus,
  getClusterTokenEnvVarName,
} from '@/lib/executor/config';
import { performClusterConfigCheck } from '@/lib/executor/config-check';
import { testDopplerConnection } from '@/lib/doppler';
import type { ClusterConfigCheckResult, ConfigCheckLevel } from '@sql-ops/shared';

interface ActionResult {
  success: boolean;
  error?: string;
  clusterId?: string;
  data?: Record<string, unknown>;
}

// 集群代号只能包含小写字母、数字和连字符
const clusterCodeRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

const clusterSchema = z.object({
  name: z
    .string()
    .min(1, '集群代号不能为空')
    .max(50, '集群代号最多 50 个字符')
    .regex(clusterCodeRegex, '集群代号只能包含小写字母、数字和连字符，且不能以连字符开头或结尾'),
  displayName: z.string().min(1, '集群名称不能为空').max(100, '集群名称最多 100 个字符'),
  region: z.string().max(50).optional(),
});

/**
 * 创建新集群
 * 注意：Doppler Token 现在从环境变量 CLUSTER_DOPPLER_TOKEN_{CLUSTER_NAME} 自动读取
 */
export async function createCluster(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Parse and validate input
    const rawData = {
      name: (formData.get('name') as string)?.toLowerCase().trim(),
      displayName: (formData.get('displayName') as string)?.trim(),
      region: (formData.get('region') as string)?.trim() || undefined,
    };

    const validated = clusterSchema.parse(rawData);

    // Check if name already exists
    const [existing] = await getDb()
      .select({ id: clusters.id })
      .from(clusters)
      .where(eq(clusters.name, validated.name))
      .limit(1);

    if (existing) {
      return { success: false, error: '集群代号已存在' };
    }

    // 检查环境变量是否已配置
    const envStatus = checkClusterEnvStatus(validated.name);

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    const result = await getDb().transaction(async (tx) => {
      // Create cluster
      const [cluster] = await tx
        .insert(clusters)
        .values({
          name: validated.name,
          displayName: validated.displayName,
          region: validated.region || null,
          // 不再在数据库中存储 Doppler Token，改为从环境变量读取
          dopplerTokenEncrypted: null,
          enabled: true,
          createdBy: admin.id,
        })
        .returning({ id: clusters.id, name: clusters.name });

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'cluster.create',
        targetType: 'cluster',
        targetId: cluster.id,
        payload: {
          name: cluster.name,
          displayName: validated.displayName,
          envVarName: envStatus.envVarName,
          envConfigured: envStatus.configured,
        },
        ipAddress,
        userAgent,
      });

      return cluster;
    });

    revalidatePath('/admin/clusters');
    return { success: true, clusterId: result.id };
  } catch (error) {
    console.error('Failed to create cluster:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '创建集群失败',
    };
  }
}

/**
 * 更新集群
 * 注意：Doppler Token 现在从环境变量自动读取，无需手动配置
 */
export async function updateCluster(
  clusterId: string,
  formData: FormData
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Get current cluster
    const [currentCluster] = await getDb()
      .select({
        id: clusters.id,
        name: clusters.name,
      })
      .from(clusters)
      .where(eq(clusters.id, clusterId))
      .limit(1);

    if (!currentCluster) {
      return { success: false, error: '集群不存在' };
    }

    // Parse and validate input
    const rawData = {
      name: currentCluster.name, // name 不可修改
      displayName: (formData.get('displayName') as string)?.trim(),
      region: (formData.get('region') as string)?.trim() || undefined,
    };

    const validated = clusterSchema.parse(rawData);

    // Get request metadata
    const headersList = await headers();
    const ipAddress =
      headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      headersList.get('x-real-ip') ||
      'unknown';
    const userAgent = headersList.get('user-agent') || 'unknown';

    await getDb().transaction(async (tx) => {
      // Update cluster
      await tx
        .update(clusters)
        .set({
          displayName: validated.displayName,
          region: validated.region || null,
          updatedAt: new Date(),
        })
        .where(eq(clusters.id, clusterId));

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'cluster.update',
        targetType: 'cluster',
        targetId: clusterId,
        payload: {
          displayName: validated.displayName,
        },
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/clusters');
    return { success: true };
  } catch (error) {
    console.error('Failed to update cluster:', error);
    if (error instanceof z.ZodError) {
      return { success: false, error: error.errors[0].message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : '更新集群失败',
    };
  }
}

/**
 * 切换集群启用状态
 */
export async function toggleCluster(
  clusterId: string,
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
        .update(clusters)
        .set({
          enabled,
          updatedAt: new Date(),
        })
        .where(eq(clusters.id, clusterId));

      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: enabled ? 'cluster.enable' : 'cluster.disable',
        targetType: 'cluster',
        targetId: clusterId,
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/clusters');
    return { success: true };
  } catch (error) {
    console.error('Failed to toggle cluster:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '切换集群状态失败',
    };
  }
}

/**
 * 删除集群（需要输入确认码）
 */
export async function deleteCluster(
  clusterId: string,
  confirmationCode: string
): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();

    // Get cluster info
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

    // Verify confirmation code
    if (confirmationCode !== cluster.name) {
      return { success: false, error: '确认码不正确，请输入集群代号' };
    }

    // Check if there are associated db_targets
    const [targetCount] = await getDb()
      .select({ count: count() })
      .from(dbTargets)
      .where(eq(dbTargets.clusterId, clusterId));

    if ((targetCount?.count ?? 0) > 0) {
      return {
        success: false,
        error: `该集群下有 ${targetCount?.count} 个数据库目标，请先删除它们`,
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
      // Delete cluster
      await tx.delete(clusters).where(eq(clusters.id, clusterId));

      // Write audit log
      await tx.insert(auditLogs).values({
        actorUserId: admin.id,
        action: 'cluster.delete',
        targetType: 'cluster',
        targetId: clusterId,
        payload: {
          name: cluster.name,
          displayName: cluster.displayName,
        },
        ipAddress,
        userAgent,
      });
    });

    revalidatePath('/admin/clusters');
    return { success: true };
  } catch (error) {
    console.error('Failed to delete cluster:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '删除集群失败',
    };
  }
}

/**
 * 检查集群环境变量配置状态
 * 用于检查 CLUSTER_DOPPLER_TOKEN_{CLUSTER_NAME} 环境变量是否已配置
 *
 * @param clusterName 集群名称（支持 US-1, US_1, us-1, us_1 等格式）
 */
export async function checkClusterEnvConfig(
  clusterName: string
): Promise<ActionResult> {
  try {
    await requireAdmin();

    if (!clusterName?.trim()) {
      return { success: false, error: '请提供集群名称' };
    }

    const envStatus = checkClusterEnvStatus(clusterName.trim());

    return {
      success: true,
      data: {
        configured: envStatus.configured,
        envVarName: envStatus.envVarName,
      },
    };
  } catch (error) {
    console.error('Failed to check cluster env config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '检查环境变量配置失败',
    };
  }
}

/**
 * 获取集群对应的环境变量名称
 * 用于在 UI 中显示需要配置的环境变量名
 */
export async function getClusterEnvVarName(
  clusterName: string
): Promise<ActionResult> {
  try {
    await requireAdmin();

    if (!clusterName?.trim()) {
      return { success: false, error: '请提供集群名称' };
    }

    const envVarName = getClusterTokenEnvVarName(clusterName.trim());

    return {
      success: true,
      data: { envVarName },
    };
  } catch (error) {
    console.error('Failed to get cluster env var name:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '获取环境变量名称失败',
    };
  }
}

/**
 * 测试集群环境变量中的 Doppler Token 是否有效
 * 从环境变量 CLUSTER_DOPPLER_TOKEN_{CLUSTER_NAME} 读取 Token 并验证
 *
 * @param clusterName 集群名称（支持 US-1, US_1, us-1, us_1 等格式）
 */
export async function testClusterEnvToken(
  clusterName: string
): Promise<ActionResult> {
  try {
    await requireAdmin();

    if (!clusterName?.trim()) {
      return { success: false, error: '请提供集群名称' };
    }

    const envStatus = checkClusterEnvStatus(clusterName.trim());

    if (!envStatus.configured) {
      return {
        success: false,
        error: `环境变量 ${envStatus.envVarName} 未配置，请在 Console 的 Doppler 配置中添加`,
      };
    }

    // 从环境变量获取 Token
    const token = process.env[envStatus.envVarName];
    if (!token) {
      return {
        success: false,
        error: `无法读取环境变量 ${envStatus.envVarName}`,
      };
    }

    // 测试 Token 是否有效
    const result = await testDopplerConnection(token);

    if (result.success) {
      return {
        success: true,
        data: {
          secretCount: result.secretCount,
          envVarName: envStatus.envVarName,
        },
      };
    } else {
      return {
        success: false,
        error: result.error || 'Token 验证失败',
      };
    }
  } catch (error) {
    console.error('Failed to test cluster env token:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '测试连接失败',
    };
  }
}

/**
 * 执行完整的集群配置检测
 * 检查 Doppler Token、Executor 配置和所有数据库目标的配置状态
 *
 * @param clusterName 集群名称
 * @param clusterDisplayName 集群显示名称
 * @param checkLevel 检测级别: 'config' | 'connection' | 'full'
 * @param forceRefresh 是否强制刷新缓存
 */
export async function checkClusterConfig(
  clusterName: string,
  clusterDisplayName: string,
  checkLevel: ConfigCheckLevel = 'connection',
  forceRefresh: boolean = false
): Promise<{
  success: boolean;
  result?: ClusterConfigCheckResult;
  error?: string;
}> {
  try {
    await requireAdmin();

    if (!clusterName?.trim()) {
      return { success: false, error: '请提供集群名称' };
    }

    const result = await performClusterConfigCheck(
      clusterName.trim(),
      clusterDisplayName,
      { checkLevel, forceRefresh }
    );

    return {
      success: true,
      result,
    };
  } catch (error) {
    console.error('Failed to check cluster config:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '配置检测失败',
    };
  }
}
