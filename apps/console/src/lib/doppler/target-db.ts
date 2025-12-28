/**
 * 目标数据库配置获取模块
 *
 * 通过两层 Doppler Token 关联获取目标数据库 URL：
 * 1. 第一层：CLUSTER_DOPPLER_TOKEN_* → 获取集群的 TARGET_DB_DOPPLER_TOKEN
 * 2. 第二层：TARGET_DB_DOPPLER_TOKEN → 获取目标数据库 URL
 *
 * 支持的环境变量：
 * - DATABASE_URL: PolarDB MySQL 主库
 * - DATABASE_URL_READ_ONLY: PolarDB MySQL 只读库
 * - DATABASE_URL_RECORD: PolarDB MySQL 日志库
 * - DATABASE_URL_ADB: AnalyticDB
 * - REDIS_URL: Redis
 */

import { fetchDopplerSecrets } from './client';
import {
  getClusterTokenEnvVarName,
  normalizeClusterName,
} from '@/lib/executor/config';
import {
  DB_TARGET_TYPES,
  type DbTargetTypeKey,
} from '@sql-ops/shared';
import { maskDatabaseUrl } from '@sql-ops/shared';

/**
 * 目标数据库 URL 的环境变量名
 */
export const TARGET_DB_ENV_VARS = [
  'DATABASE_URL',
  'DATABASE_URL_READ_ONLY',
  'DATABASE_URL_RECORD',
  'DATABASE_URL_ADB',
  'REDIS_URL',
] as const;

export type TargetDbEnvVar = (typeof TARGET_DB_ENV_VARS)[number];

/**
 * 单个数据库 URL 的配置状态
 */
export interface DbUrlStatus {
  /** 是否已配置 */
  configured: boolean;
  /** 脱敏后的 URL（仅当 configured 为 true 时有值） */
  maskedUrl?: string;
  /** 环境变量名 */
  envVar: TargetDbEnvVar;
}

/**
 * 集群目标数据库配置状态
 */
export interface ClusterTargetDbStatus {
  /** 集群名称 */
  clusterName: string;
  /** 配置来源 */
  source: 'doppler' | 'none';
  /** 是否有 TARGET_DB_DOPPLER_TOKEN */
  hasTargetDbToken: boolean;
  /** 各数据库 URL 的配置状态 */
  databases: Record<TargetDbEnvVar, DbUrlStatus>;
  /** 错误信息（如果有） */
  error?: string;
}

// 缓存配置
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
interface CacheEntry {
  status: ClusterTargetDbStatus;
  fetchedAt: number;
}
const statusCache = new Map<string, CacheEntry>();

/**
 * 获取集群的目标数据库配置状态
 *
 * @param clusterName 集群名称
 * @returns 目标数据库配置状态
 */
export async function getClusterTargetDbStatus(
  clusterName: string
): Promise<ClusterTargetDbStatus> {
  const cacheKey = `target-db:${normalizeClusterName(clusterName)}`;

  // 检查缓存
  const cached = statusCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.status;
  }

  // 获取新的配置
  const status = await fetchClusterTargetDbStatus(clusterName);

  // 缓存结果
  statusCache.set(cacheKey, {
    status,
    fetchedAt: Date.now(),
  });

  return status;
}

/**
 * 从 Doppler 获取集群的目标数据库配置状态
 */
async function fetchClusterTargetDbStatus(
  clusterName: string
): Promise<ClusterTargetDbStatus> {
  // 初始化空状态
  const emptyDatabases: Record<TargetDbEnvVar, DbUrlStatus> = {
    DATABASE_URL: { configured: false, envVar: 'DATABASE_URL' },
    DATABASE_URL_READ_ONLY: { configured: false, envVar: 'DATABASE_URL_READ_ONLY' },
    DATABASE_URL_RECORD: { configured: false, envVar: 'DATABASE_URL_RECORD' },
    DATABASE_URL_ADB: { configured: false, envVar: 'DATABASE_URL_ADB' },
    REDIS_URL: { configured: false, envVar: 'REDIS_URL' },
  };

  // 第一层：获取集群的 Doppler Token
  const clusterTokenEnvVar = getClusterTokenEnvVarName(clusterName);
  const clusterToken = process.env[clusterTokenEnvVar];

  if (!clusterToken) {
    console.warn(`[TargetDb] No cluster token found: ${clusterTokenEnvVar}`);
    return {
      clusterName,
      source: 'none',
      hasTargetDbToken: false,
      databases: emptyDatabases,
      error: `未找到集群 Doppler Token: ${clusterTokenEnvVar}`,
    };
  }

  try {
    // 从集群 Doppler 获取 TARGET_DB_DOPPLER_TOKEN
    console.log(`[TargetDb] Fetching cluster secrets for: ${clusterName}`);
    const clusterSecrets = await fetchDopplerSecrets(clusterToken);
    const targetDbToken = clusterSecrets.TARGET_DB_DOPPLER_TOKEN;

    if (!targetDbToken) {
      console.warn(`[TargetDb] No TARGET_DB_DOPPLER_TOKEN in cluster ${clusterName}`);
      return {
        clusterName,
        source: 'none',
        hasTargetDbToken: false,
        databases: emptyDatabases,
        error: '集群中未配置 TARGET_DB_DOPPLER_TOKEN',
      };
    }

    // 第二层：获取目标数据库的 URL
    console.log(`[TargetDb] Fetching target DB secrets for: ${clusterName}`);
    const targetDbSecrets = await fetchDopplerSecrets(targetDbToken);

    // 构建配置状态
    const databases: Record<TargetDbEnvVar, DbUrlStatus> = {
      DATABASE_URL: buildDbUrlStatus('DATABASE_URL', targetDbSecrets.DATABASE_URL),
      DATABASE_URL_READ_ONLY: buildDbUrlStatus(
        'DATABASE_URL_READ_ONLY',
        targetDbSecrets.DATABASE_URL_READ_ONLY
      ),
      DATABASE_URL_RECORD: buildDbUrlStatus(
        'DATABASE_URL_RECORD',
        targetDbSecrets.DATABASE_URL_RECORD
      ),
      DATABASE_URL_ADB: buildDbUrlStatus('DATABASE_URL_ADB', targetDbSecrets.DATABASE_URL_ADB),
      REDIS_URL: buildDbUrlStatus('REDIS_URL', targetDbSecrets.REDIS_URL),
    };

    console.log(`[TargetDb] Successfully fetched target DB config for ${clusterName}`);

    return {
      clusterName,
      source: 'doppler',
      hasTargetDbToken: true,
      databases,
    };
  } catch (error) {
    console.error(`[TargetDb] Failed to fetch target DB config for ${clusterName}:`, error);
    return {
      clusterName,
      source: 'none',
      hasTargetDbToken: false,
      databases: emptyDatabases,
      error: error instanceof Error ? error.message : '获取配置失败',
    };
  }
}

/**
 * 构建数据库 URL 状态
 */
function buildDbUrlStatus(envVar: TargetDbEnvVar, url: string | undefined): DbUrlStatus {
  if (!url) {
    return { configured: false, envVar };
  }

  return {
    configured: true,
    maskedUrl: maskDatabaseUrl(url),
    envVar,
  };
}

/**
 * 获取特定数据库目标类型的配置状态
 *
 * @param clusterName 集群名称
 * @param targetTypeKey 目标类型 key
 * @returns 配置状态
 */
export async function getTargetDbUrlStatus(
  clusterName: string,
  targetTypeKey: DbTargetTypeKey
): Promise<DbUrlStatus | null> {
  const targetConfig = DB_TARGET_TYPES[targetTypeKey];
  if (!targetConfig) {
    return null;
  }

  const status = await getClusterTargetDbStatus(clusterName);
  return status.databases[targetConfig.envVar as TargetDbEnvVar] || null;
}

/**
 * 测试集群的目标数据库连接
 * 仅检查配置是否存在，不实际连接数据库
 *
 * @param clusterName 集群名称
 * @param targetTypeKey 目标类型 key
 * @returns 测试结果
 */
export async function testTargetDbConfig(
  clusterName: string,
  targetTypeKey: DbTargetTypeKey
): Promise<{
  success: boolean;
  configured: boolean;
  maskedUrl?: string;
  error?: string;
}> {
  try {
    const urlStatus = await getTargetDbUrlStatus(clusterName, targetTypeKey);

    if (!urlStatus) {
      return {
        success: false,
        configured: false,
        error: '无效的目标类型',
      };
    }

    return {
      success: urlStatus.configured,
      configured: urlStatus.configured,
      maskedUrl: urlStatus.maskedUrl,
      error: urlStatus.configured ? undefined : '环境变量未配置',
    };
  } catch (error) {
    return {
      success: false,
      configured: false,
      error: error instanceof Error ? error.message : '测试失败',
    };
  }
}

/**
 * 清除目标数据库配置缓存
 *
 * @param clusterName 集群名称（可选，不传则清除所有）
 */
export function clearTargetDbStatusCache(clusterName?: string): void {
  if (clusterName) {
    const cacheKey = `target-db:${normalizeClusterName(clusterName)}`;
    statusCache.delete(cacheKey);
  } else {
    statusCache.clear();
  }
  console.log('[TargetDb] Cache cleared');
}

/**
 * 获取缓存统计信息
 */
export function getTargetDbCacheStats(): {
  size: number;
  entries: Array<{ clusterName: string; age: number; hasTargetDbToken: boolean }>;
} {
  const now = Date.now();
  const entries = Array.from(statusCache.entries()).map(([key, entry]) => ({
    clusterName: key.replace('target-db:', ''),
    age: now - entry.fetchedAt,
    hasTargetDbToken: entry.status.hasTargetDbToken,
  }));

  return {
    size: statusCache.size,
    entries,
  };
}

/**
 * 获取集群中已配置的数据库列表
 *
 * @param clusterName 集群名称
 * @returns 已配置的目标类型 key 列表
 */
export async function getConfiguredTargetTypes(
  clusterName: string
): Promise<DbTargetTypeKey[]> {
  const status = await getClusterTargetDbStatus(clusterName);

  const configuredTypes: DbTargetTypeKey[] = [];

  for (const [key, config] of Object.entries(DB_TARGET_TYPES)) {
    const envVar = config.envVar as TargetDbEnvVar;
    if (status.databases[envVar]?.configured) {
      configuredTypes.push(key as DbTargetTypeKey);
    }
  }

  return configuredTypes;
}
