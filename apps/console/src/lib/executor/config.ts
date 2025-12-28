/**
 * Executor configuration manager for multi-cluster support
 * Handles dynamic retrieval of Executor URLs and signing secrets based on cluster configuration
 *
 * 配置来源优先级:
 * 1. 环境变量 CLUSTER_DOPPLER_TOKEN_{CLUSTER_NAME} (如 CLUSTER_DOPPLER_TOKEN_DEV)
 * 2. 数据库存储的加密 Doppler Token
 * 3. 环境变量 EXECUTOR_BASE_URL / EXECUTOR_SIGNING_SECRET (本地开发回退)
 *
 * 缓存策略:
 * - 首次请求时获取配置
 * - 缓存 5 分钟 (可配置)
 * - 支持手动清除缓存
 */

import { getClusterById, getClusterByName } from '@/lib/queries/clusters';
import { decryptDopplerToken, isEncryptionKeyConfigured } from '@/lib/crypto/doppler-token';
import { fetchDopplerSecrets } from '@/lib/doppler';

/**
 * Executor configuration for a cluster
 */
export interface ExecutorConfig {
  /** Executor 服务 URL */
  url: string;
  /** 请求签名密钥 */
  signingSecret: string;
  /** 配置来源 */
  source: 'env' | 'database' | 'fallback';
}

/**
 * Cache entry for executor config
 */
interface CacheEntry {
  config: ExecutorConfig;
  fetchedAt: number;
}

// In-memory cache with 5 minute TTL
const configCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Fallback to environment variables for local development
const FALLBACK_EXECUTOR_URL = process.env.EXECUTOR_BASE_URL || 'http://localhost:8787';
const FALLBACK_SIGNING_SECRET = process.env.EXECUTOR_SIGNING_SECRET || '';

/**
 * 标准化集群名称为环境变量格式
 * 支持多种输入格式的兼容匹配：
 *   - US-1, US_1, us-1, us_1 都会匹配到 US_1
 *
 * @param clusterName 集群名称（任意格式）
 * @returns 标准化的集群名称（大写，下划线分隔）
 */
export function normalizeClusterName(clusterName: string): string {
  // 统一转大写，将连字符替换为下划线
  return clusterName.toUpperCase().replace(/-/g, '_');
}

/**
 * 获取集群的 Doppler Token 环境变量名
 * 格式: CLUSTER_DOPPLER_TOKEN_{CLUSTER_NAME}
 *
 * 示例:
 *   dev → CLUSTER_DOPPLER_TOKEN_DEV
 *   sg-1 → CLUSTER_DOPPLER_TOKEN_SG_1
 *   US-1 → CLUSTER_DOPPLER_TOKEN_US_1
 *   us_1 → CLUSTER_DOPPLER_TOKEN_US_1
 */
export function getClusterTokenEnvVarName(clusterName: string): string {
  const normalized = normalizeClusterName(clusterName);
  return `CLUSTER_DOPPLER_TOKEN_${normalized}`;
}

/**
 * 从环境变量获取集群的 Doppler Token
 */
function getClusterTokenFromEnv(clusterName: string): string | null {
  const envVarName = getClusterTokenEnvVarName(clusterName);
  const token = process.env[envVarName];

  if (token) {
    console.log(`[ExecutorConfig] Found Doppler token in environment: ${envVarName}`);
    return token;
  }

  return null;
}

/**
 * 检查集群的环境变量是否已配置
 *
 * @param clusterName 集群名称（支持 US-1, US_1, us-1, us_1 等格式）
 * @returns 环境变量配置状态
 */
export function checkClusterEnvStatus(clusterName: string): {
  configured: boolean;
  envVarName: string;
} {
  const envVarName = getClusterTokenEnvVarName(clusterName);
  const token = process.env[envVarName];

  return {
    configured: !!token,
    envVarName,
  };
}

/**
 * 批量检查多个集群的环境变量配置状态
 *
 * @param clusterNames 集群名称列表
 * @returns 配置状态映射
 */
export function checkMultipleClustersEnvStatus(
  clusterNames: string[]
): Map<string, { configured: boolean; envVarName: string }> {
  const statusMap = new Map<string, { configured: boolean; envVarName: string }>();

  for (const name of clusterNames) {
    statusMap.set(name, checkClusterEnvStatus(name));
  }

  return statusMap;
}

/**
 * Get executor configuration for a cluster
 * Uses caching to minimize Doppler API calls
 *
 * @param clusterIdOrName - The cluster ID (UUID) or cluster name
 * @returns Executor configuration with URL and signing secret
 */
export async function getExecutorConfig(clusterIdOrName: string): Promise<ExecutorConfig> {
  const cacheKey = `executor:${clusterIdOrName}`;

  // Check cache first
  const cached = configCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  // Fetch fresh configuration
  const config = await fetchExecutorConfig(clusterIdOrName);

  // Cache the result
  configCache.set(cacheKey, {
    config,
    fetchedAt: Date.now(),
  });

  return config;
}

/**
 * Fetch executor configuration
 * 优先级: 环境变量 Token > 数据库加密 Token > 环境变量 Fallback
 */
async function fetchExecutorConfig(clusterIdOrName: string): Promise<ExecutorConfig> {
  // 尝试确定集群名称
  let clusterName: string | null = null;
  let cluster: Awaited<ReturnType<typeof getClusterById>> = null;

  // 如果是 UUID 格式，先查询数据库获取集群名称
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clusterIdOrName);

  if (isUuid) {
    cluster = await getClusterById(clusterIdOrName);
    if (cluster) {
      clusterName = cluster.name;
    }
  } else {
    // 假设是集群名称
    clusterName = clusterIdOrName;
    cluster = await getClusterByName(clusterIdOrName);
  }

  // 优先级 1: 从环境变量获取 Doppler Token
  if (clusterName) {
    const envToken = getClusterTokenFromEnv(clusterName);
    if (envToken) {
      try {
        const config = await fetchConfigFromDopplerToken(envToken, clusterName);
        if (config) {
          return { ...config, source: 'env' };
        }
      } catch (error) {
        console.error(`[ExecutorConfig] Failed to fetch from env token for ${clusterName}:`, error);
      }
    }
  }

  // 优先级 2: 从数据库加密 Token 获取
  if (cluster?.dopplerTokenEncrypted && isEncryptionKeyConfigured()) {
    try {
      const dopplerToken = decryptDopplerToken(cluster.dopplerTokenEncrypted);
      const config = await fetchConfigFromDopplerToken(dopplerToken, cluster.name);
      if (config) {
        return { ...config, source: 'database' };
      }
    } catch (error) {
      console.error(`[ExecutorConfig] Failed to fetch from database token for ${clusterName}:`, error);
    }
  }

  // 优先级 3: Fallback
  console.warn(`[ExecutorConfig] Using fallback config for cluster: ${clusterIdOrName}`);
  return getFallbackConfig();
}

/**
 * 从 Doppler Token 获取 Executor 配置
 */
async function fetchConfigFromDopplerToken(
  token: string,
  clusterName: string
): Promise<Omit<ExecutorConfig, 'source'> | null> {
  try {
    console.log(`[ExecutorConfig] Fetching Executor config from Doppler for cluster: ${clusterName}`);
    const secrets = await fetchDopplerSecrets(token);

    // 支持两种环境变量名称: EXECUTOR_URL 和 EXECUTOR_BASE_URL
    const executorUrl = secrets.EXECUTOR_URL || secrets.EXECUTOR_BASE_URL;
    const signingSecret = secrets.EXECUTOR_SIGNING_SECRET;

    if (!executorUrl) {
      console.warn(`[ExecutorConfig] Cluster ${clusterName} missing EXECUTOR_URL in Doppler`);
      return null;
    }

    console.log(`[ExecutorConfig] Successfully fetched config for ${clusterName}: ${executorUrl}`);

    return {
      url: executorUrl,
      signingSecret: signingSecret || FALLBACK_SIGNING_SECRET,
    };
  } catch (error) {
    console.error(`[ExecutorConfig] Doppler API error for ${clusterName}:`, error);
    return null;
  }
}

/**
 * Get fallback configuration from environment variables
 * Used for local development or when Doppler is not configured
 */
function getFallbackConfig(): ExecutorConfig {
  return {
    url: FALLBACK_EXECUTOR_URL,
    signingSecret: FALLBACK_SIGNING_SECRET,
    source: 'fallback',
  };
}

/**
 * Clear cached configuration for a specific cluster
 * Useful when cluster configuration is updated
 */
export function clearExecutorConfigCache(clusterIdOrName?: string): void {
  if (clusterIdOrName) {
    configCache.delete(`executor:${clusterIdOrName}`);
  } else {
    configCache.clear();
  }
}

/**
 * Get all cached cluster IDs
 * Useful for debugging
 */
export function getCachedClusterIds(): string[] {
  return Array.from(configCache.keys()).map((key) => key.replace('executor:', ''));
}

/**
 * Check if we're using fallback configuration
 * Returns true if no Doppler tokens are configured
 */
export function isUsingFallbackConfig(): boolean {
  // 检查是否有任何 CLUSTER_DOPPLER_TOKEN_* 环境变量
  const hasEnvTokens = Object.keys(process.env).some((key) =>
    key.startsWith('CLUSTER_DOPPLER_TOKEN_')
  );

  // 检查是否配置了加密密钥（用于数据库存储的 token）
  const hasEncryptionKey = isEncryptionKeyConfigured();

  return !hasEnvTokens && !hasEncryptionKey;
}

/**
 * Get cache statistics
 * Useful for monitoring
 */
export function getCacheStats(): {
  size: number;
  entries: Array<{ clusterId: string; age: number; source: string }>;
} {
  const now = Date.now();
  const entries = Array.from(configCache.entries()).map(([key, entry]) => ({
    clusterId: key.replace('executor:', ''),
    age: now - entry.fetchedAt,
    source: entry.config.source,
  }));

  return {
    size: configCache.size,
    entries,
  };
}

/**
 * 列出所有配置的集群 Token 环境变量
 * 用于调试和诊断
 */
export function listConfiguredClusterTokens(): string[] {
  return Object.keys(process.env)
    .filter((key) => key.startsWith('CLUSTER_DOPPLER_TOKEN_'))
    .map((key) => key.replace('CLUSTER_DOPPLER_TOKEN_', '').toLowerCase().replace(/_/g, '-'));
}
