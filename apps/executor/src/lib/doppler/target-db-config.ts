/**
 * Target Database Configuration Loader
 * 从 TARGET_DB_DOPPLER_TOKEN 获取目标数据库配置，支持 TTL 缓存
 *
 * 配置来源优先级:
 * 1. 环境变量 (DATABASE_URL, DATABASE_URL_READ_ONLY, DATABASE_URL_RECORD, DATABASE_URL_ADB, REDIS_URL)
 * 2. TARGET_DB_DOPPLER_TOKEN (从 Doppler API 获取)
 * 3. 本地缓存文件 (仅在本地开发环境，Doppler 获取失败时使用)
 *
 * 缓存策略:
 * - 首次请求时获取配置
 * - 内存缓存 5 分钟 (可配置)
 * - 本地开发环境下，成功获取后持久化到本地文件
 * - Doppler 获取失败时，尝试从本地文件读取
 * - 支持手动清除缓存
 */

import { fetchDopplerSecrets } from './client';
import { parseMysqlUrl, parseRedisUrl } from '../url-parser';
import type { ParsedDbConnection, ParsedRedisConnection } from '../url-parser';
import {
  saveToLocalCache,
  loadFromLocalCache,
  getLocalCacheStats,
} from './local-cache';

// Re-export types for backwards compatibility
export type { ParsedDbConnection, ParsedRedisConnection };

/**
 * 目标数据库配置
 *
 * 包含所有固定化的数据库类型：
 * - PolarDB MySQL 主库 (DATABASE_URL)
 * - PolarDB MySQL 只读库 (DATABASE_URL_READ_ONLY)
 * - PolarDB MySQL 日志库 (DATABASE_URL_RECORD)
 * - AnalyticDB (DATABASE_URL_ADB)
 * - Redis (REDIS_URL)
 */
export interface TargetDbConfig {
  /** PolarDB MySQL 主库连接字符串 */
  databaseUrl: string | null;
  /** PolarDB MySQL 只读库连接字符串 */
  databaseUrlReadOnly: string | null;
  /** PolarDB MySQL 日志库连接字符串 */
  databaseUrlRecord: string | null;
  /** AnalyticDB (ADB) 连接字符串 */
  databaseUrlAdb: string | null;
  /** Redis 连接字符串 */
  redisUrl: string | null;
  /** 配置来源 */
  source: 'env' | 'doppler' | 'local-cache' | 'none';
  /** 获取时间戳 */
  fetchedAt: number;
}

// 缓存配置
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟
let cachedConfig: TargetDbConfig | null = null;
let fetchPromise: Promise<TargetDbConfig> | null = null;

/**
 * 获取目标数据库配置
 * 自动处理缓存和 Doppler API 调用
 *
 * @returns 目标数据库配置
 */
export async function getTargetDbConfig(): Promise<TargetDbConfig> {
  // 检查缓存是否有效
  if (cachedConfig && Date.now() - cachedConfig.fetchedAt < CACHE_TTL_MS) {
    return cachedConfig;
  }

  // 避免并发请求时重复调用 Doppler API
  if (fetchPromise) {
    return fetchPromise;
  }

  fetchPromise = fetchTargetDbConfig();

  try {
    cachedConfig = await fetchPromise;
    return cachedConfig;
  } finally {
    fetchPromise = null;
  }
}

/**
 * 从环境变量或 Doppler 获取配置
 */
async function fetchTargetDbConfig(): Promise<TargetDbConfig> {
  const now = Date.now();

  // 优先级 1: 直接从环境变量获取
  const envDatabaseUrl = process.env.DATABASE_URL;
  const envDatabaseUrlReadOnly = process.env.DATABASE_URL_READ_ONLY;
  const envDatabaseUrlRecord = process.env.DATABASE_URL_RECORD;
  const envDatabaseUrlAdb = process.env.DATABASE_URL_ADB;
  const envRedisUrl = process.env.REDIS_URL;

  // 如果环境变量中已有任何配置，直接使用
  if (
    envDatabaseUrl ||
    envDatabaseUrlReadOnly ||
    envDatabaseUrlRecord ||
    envDatabaseUrlAdb ||
    envRedisUrl
  ) {
    console.log('[TargetDbConfig] Using configuration from environment variables');
    return {
      databaseUrl: envDatabaseUrl || null,
      databaseUrlReadOnly: envDatabaseUrlReadOnly || null,
      databaseUrlRecord: envDatabaseUrlRecord || null,
      databaseUrlAdb: envDatabaseUrlAdb || null,
      redisUrl: envRedisUrl || null,
      source: 'env',
      fetchedAt: now,
    };
  }

  // 优先级 2: 从 TARGET_DB_DOPPLER_TOKEN 获取
  const targetDbToken = process.env.TARGET_DB_DOPPLER_TOKEN;

  if (!targetDbToken) {
    console.warn(
      '[TargetDbConfig] No TARGET_DB_DOPPLER_TOKEN configured, no target database available'
    );
    return {
      databaseUrl: null,
      databaseUrlReadOnly: null,
      databaseUrlRecord: null,
      databaseUrlAdb: null,
      redisUrl: null,
      source: 'none',
      fetchedAt: now,
    };
  }

  try {
    console.log('[TargetDbConfig] Fetching configuration from Doppler...');
    const secrets = await fetchDopplerSecrets(targetDbToken);

    const config: TargetDbConfig = {
      databaseUrl: secrets.DATABASE_URL || null,
      databaseUrlReadOnly: secrets.DATABASE_URL_READ_ONLY || null,
      databaseUrlRecord: secrets.DATABASE_URL_RECORD || null,
      databaseUrlAdb: secrets.DATABASE_URL_ADB || null,
      redisUrl: secrets.REDIS_URL || null,
      source: 'doppler',
      fetchedAt: now,
    };

    console.log('[TargetDbConfig] Configuration fetched successfully from Doppler', {
      hasDatabaseUrl: !!config.databaseUrl,
      hasDatabaseUrlReadOnly: !!config.databaseUrlReadOnly,
      hasDatabaseUrlRecord: !!config.databaseUrlRecord,
      hasDatabaseUrlAdb: !!config.databaseUrlAdb,
      hasRedisUrl: !!config.redisUrl,
    });

    // 成功获取后，保存到本地缓存（仅在本地开发环境）
    saveToLocalCache(secrets, targetDbToken);

    return config;
  } catch (error) {
    console.error('[TargetDbConfig] Failed to fetch from Doppler:', error);

    // 尝试从本地缓存读取（仅在本地开发环境）
    const cachedSecrets = loadFromLocalCache(targetDbToken);
    if (cachedSecrets) {
      console.log('[TargetDbConfig] Using configuration from local cache (fallback)');
      return {
        databaseUrl: cachedSecrets.DATABASE_URL || null,
        databaseUrlReadOnly: cachedSecrets.DATABASE_URL_READ_ONLY || null,
        databaseUrlRecord: cachedSecrets.DATABASE_URL_RECORD || null,
        databaseUrlAdb: cachedSecrets.DATABASE_URL_ADB || null,
        redisUrl: cachedSecrets.REDIS_URL || null,
        source: 'local-cache',
        fetchedAt: now,
      };
    }

    // 返回空配置，但标记为从 doppler 获取失败
    return {
      databaseUrl: null,
      databaseUrlReadOnly: null,
      databaseUrlRecord: null,
      databaseUrlAdb: null,
      redisUrl: null,
      source: 'none',
      fetchedAt: now,
    };
  }
}

// Re-export URL parsers for backwards compatibility
export { parseMysqlUrl, parseRedisUrl };

/**
 * 根据 code 获取对应的数据库 URL
 *
 * @param code 数据库代号
 * @returns 对应的 URL 或 null
 */
export async function getTargetDbUrlByCode(code: string): Promise<string | null> {
  const config = await getTargetDbConfig();

  switch (code) {
    case 'primary':
      return config.databaseUrl;
    case 'read_only':
      return config.databaseUrlReadOnly;
    case 'record':
      return config.databaseUrlRecord;
    case 'adb':
      return config.databaseUrlAdb;
    case 'redis':
      return config.redisUrl;
    default:
      return null;
  }
}

/**
 * 清除配置缓存
 * 下次调用 getTargetDbConfig() 时将重新获取
 */
export function clearTargetDbConfigCache(): void {
  cachedConfig = null;
  console.log('[TargetDbConfig] Cache cleared');
}

/**
 * 获取缓存统计信息
 * 用于监控和调试
 */
export function getTargetDbCacheStats(): {
  cached: boolean;
  source: string | null;
  age: number | null;
  ttlRemaining: number | null;
  localCache: {
    exists: boolean;
    isLocalDev: boolean;
    ageMs: number | null;
    path: string;
  };
} {
  const localCacheStats = getLocalCacheStats();

  if (!cachedConfig) {
    return {
      cached: false,
      source: null,
      age: null,
      ttlRemaining: null,
      localCache: localCacheStats,
    };
  }

  const age = Date.now() - cachedConfig.fetchedAt;
  const ttlRemaining = Math.max(0, CACHE_TTL_MS - age);

  return {
    cached: true,
    source: cachedConfig.source,
    age,
    ttlRemaining,
    localCache: localCacheStats,
  };
}

/**
 * 检查是否有可用的目标数据库配置
 * 不触发 Doppler API 调用，仅检查缓存和环境变量
 */
export function isTargetDbConfigAvailable(): boolean {
  // 检查缓存
  if (cachedConfig && Date.now() - cachedConfig.fetchedAt < CACHE_TTL_MS) {
    return cachedConfig.source !== 'none';
  }

  // 检查环境变量
  return !!(
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_READ_ONLY ||
    process.env.DATABASE_URL_RECORD ||
    process.env.DATABASE_URL_ADB ||
    process.env.REDIS_URL ||
    process.env.TARGET_DB_DOPPLER_TOKEN
  );
}
