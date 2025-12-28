/**
 * Database configuration loader
 * 支持四种配置模式（按优先级）:
 * 1. SERVICE_DB_CONFIG_JSON (完整 JSON 配置)
 * 2. 独立环境变量 ({CLUSTER}_{DBTYPE}_{CODE}_{FIELD})
 * 3. URL 环境变量（固定 code 映射）:
 *    - DATABASE_URL → polardb_mysql/primary
 *    - DATABASE_URL_READ_ONLY → polardb_mysql/read_only
 *    - DATABASE_URL_RECORD → polardb_mysql/record
 *    - DATABASE_URL_ADB → adb/adb
 * 4. Doppler API (通过 TARGET_DB_DOPPLER_TOKEN)
 *
 * 注意: REDIS_URL 不在此配置加载器处理，因为 Redis 不支持 SQL 执行
 */

import type { DbType, DbCode } from '@sql-ops/shared';
import { parseMysqlUrl } from '../lib/url-parser';

/**
 * Database target connection configuration
 */
export interface DbTarget {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * Full database configuration structure
 * clusterId -> dbType -> code -> DbTarget
 */
export interface DbConfig {
  [clusterId: string]: {
    [dbType: string]: {
      [code: string]: DbTarget;
    };
  };
}

/** Cached configuration (unified cache for all sources) */
let cachedConfig: DbConfig | null = null;

/** Pending initialization promise to prevent concurrent loads */
let initPromise: Promise<void> | null = null;

/** Get cluster name from environment */
function getClusterName(): string {
  return (process.env.CLUSTER_NAME || 'default').toLowerCase();
}

/**
 * Load database configuration (synchronous)
 * 注意: 应在启动时先调用 initDbConfig() 以确保 Doppler 配置已加载
 */
export function loadDbConfig(): DbConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  // 同步尝试加载（不含 Doppler）
  cachedConfig = loadConfigSync();
  return cachedConfig;
}

/**
 * 同步加载配置（优先级: JSON > 独立环境变量 > URL 环境变量）
 */
function loadConfigSync(): DbConfig {
  // Mode 1: JSON configuration
  const jsonConfig = process.env.SERVICE_DB_CONFIG_JSON;
  if (jsonConfig) {
    try {
      const config = JSON.parse(jsonConfig) as DbConfig;
      console.log('[DbConfig] Loaded from SERVICE_DB_CONFIG_JSON');
      return config;
    } catch (e) {
      console.warn(
        '[DbConfig] Failed to parse SERVICE_DB_CONFIG_JSON, falling back to other configuration sources:',
        e instanceof Error ? e.message : String(e)
      );
      // 继续尝试后备配置，不抛出错误
    }
  }

  // Mode 2: Individual environment variables
  const envConfig = loadFromIndividualEnvVars();
  if (Object.keys(envConfig).length > 0) {
    console.log('[DbConfig] Loaded from individual environment variables');
    return envConfig;
  }

  // Mode 3: URL environment variables
  const urlConfig = loadFromUrlEnvVars();
  if (Object.keys(urlConfig).length > 0) {
    console.log('[DbConfig] Loaded from URL environment variables');
    return urlConfig;
  }

  return {};
}

/**
 * Initialize database configuration (asynchronous)
 * 应在服务启动时调用，在处理请求之前
 */
export async function initDbConfig(): Promise<void> {
  // 如果已缓存，跳过
  if (cachedConfig) {
    return;
  }

  // 避免并发初始化
  if (initPromise) {
    await initPromise;
    return;
  }

  initPromise = doInitDbConfig();
  try {
    await initPromise;
  } finally {
    initPromise = null;
  }
}

/**
 * 执行初始化逻辑
 */
async function doInitDbConfig(): Promise<void> {
  // 先尝试同步加载
  const syncConfig = loadConfigSync();
  if (Object.keys(syncConfig).length > 0) {
    cachedConfig = syncConfig;
    return;
  }

  // 如果同步加载失败，尝试从 Doppler 获取
  const targetDbToken = process.env.TARGET_DB_DOPPLER_TOKEN;
  if (!targetDbToken) {
    console.warn('[DbConfig] No configuration found');
    cachedConfig = {};
    return;
  }

  // 从 Doppler 获取
  cachedConfig = await loadFromDoppler();
}

/**
 * 从 Doppler 获取配置并解析
 *
 * 环境变量映射（固定 code）:
 * - DATABASE_URL → polardb_mysql/primary
 * - DATABASE_URL_READ_ONLY → polardb_mysql/read_only
 * - DATABASE_URL_RECORD → polardb_mysql/record
 * - DATABASE_URL_ADB → adb/adb
 *
 * 注意: REDIS_URL 不在此处理，因为 Redis 不支持 SQL 执行
 */
async function loadFromDoppler(): Promise<DbConfig> {
  try {
    console.log('[DbConfig] Fetching configuration from Doppler...');

    // 动态导入避免循环依赖
    const { getTargetDbConfig } = await import('../lib/doppler/target-db-config');
    const targetConfig = await getTargetDbConfig();

    if (targetConfig.source === 'none') {
      console.warn('[DbConfig] Doppler returned no configuration');
      return {};
    }

    const config: DbConfig = {};
    const clusterId = getClusterName();

    // 解析 DATABASE_URL → polardb_mysql/primary
    if (targetConfig.databaseUrl) {
      const parsed = parseMysqlUrl(targetConfig.databaseUrl);
      if (parsed) {
        if (!config[clusterId]) config[clusterId] = {};
        if (!config[clusterId]['polardb_mysql']) config[clusterId]['polardb_mysql'] = {};
        config[clusterId]['polardb_mysql']['primary'] = parsed;
        console.log('[DbConfig] Parsed DATABASE_URL → polardb_mysql/primary');
      }
    }

    // 解析 DATABASE_URL_READ_ONLY → polardb_mysql/read_only
    if (targetConfig.databaseUrlReadOnly) {
      const parsed = parseMysqlUrl(targetConfig.databaseUrlReadOnly);
      if (parsed) {
        if (!config[clusterId]) config[clusterId] = {};
        if (!config[clusterId]['polardb_mysql']) config[clusterId]['polardb_mysql'] = {};
        config[clusterId]['polardb_mysql']['read_only'] = parsed;
        console.log('[DbConfig] Parsed DATABASE_URL_READ_ONLY → polardb_mysql/read_only');
      }
    }

    // 解析 DATABASE_URL_RECORD → polardb_mysql/record
    if (targetConfig.databaseUrlRecord) {
      const parsed = parseMysqlUrl(targetConfig.databaseUrlRecord);
      if (parsed) {
        if (!config[clusterId]) config[clusterId] = {};
        if (!config[clusterId]['polardb_mysql']) config[clusterId]['polardb_mysql'] = {};
        config[clusterId]['polardb_mysql']['record'] = parsed;
        console.log('[DbConfig] Parsed DATABASE_URL_RECORD → polardb_mysql/record');
      }
    }

    // 解析 DATABASE_URL_ADB → adb/adb（固定 code 为 adb）
    if (targetConfig.databaseUrlAdb) {
      const parsed = parseMysqlUrl(targetConfig.databaseUrlAdb);
      if (parsed) {
        if (!config[clusterId]) config[clusterId] = {};
        if (!config[clusterId]['adb']) config[clusterId]['adb'] = {};
        config[clusterId]['adb']['adb'] = parsed;
        console.log('[DbConfig] Parsed DATABASE_URL_ADB → adb/adb');
      }
    }

    console.log('[DbConfig] Successfully loaded configuration from Doppler');
    return config;
  } catch (error) {
    console.error('[DbConfig] Failed to fetch from Doppler:', error);
    return {};
  }
}

/**
 * Load configuration from individual environment variables
 * Format: {CLUSTERID}_{DBTYPE}_{CODE}_{FIELD}
 * Example: US1_POLARDB_PRIMARY_HOST
 */
function loadFromIndividualEnvVars(): DbConfig {
  const config: DbConfig = {};

  // Pattern to match: {CLUSTERID}_{DBTYPE}_{CODE}_{FIELD}
  // DBTYPE can be: POLARDB, ADB
  // CODE can be: PRIMARY, RECORD, or any custom code
  // FIELD can be: HOST, PORT, DATABASE, USER, PASSWORD

  const envVarPattern = /^([A-Z0-9_]+)_(POLARDB|ADB)_([A-Z0-9_]+)_(HOST|PORT|DATABASE|USER|PASSWORD)$/;

  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;

    const match = key.match(envVarPattern);
    if (!match) continue;

    const [, clusterId, dbTypeRaw, codeRaw, field] = match;

    // Normalize names
    const normalizedClusterId = clusterId.toLowerCase();
    const dbType = dbTypeRaw === 'POLARDB' ? 'polardb_mysql' : dbTypeRaw.toLowerCase();
    const code = codeRaw.toLowerCase();

    // Initialize nested objects
    if (!config[normalizedClusterId]) {
      config[normalizedClusterId] = {};
    }
    if (!config[normalizedClusterId][dbType]) {
      config[normalizedClusterId][dbType] = {};
    }
    if (!config[normalizedClusterId][dbType][code]) {
      config[normalizedClusterId][dbType][code] = {
        host: '',
        port: 3306,
        database: '',
        user: '',
        password: '',
      };
    }

    // Set the field value
    const target = config[normalizedClusterId][dbType][code];
    switch (field) {
      case 'HOST':
        target.host = value;
        break;
      case 'PORT':
        target.port = parseInt(value, 10) || 3306;
        break;
      case 'DATABASE':
        target.database = value;
        break;
      case 'USER':
        target.user = value;
        break;
      case 'PASSWORD':
        target.password = value;
        break;
    }
  }

  // Validate that all required fields are present
  for (const [clusterId, types] of Object.entries(config)) {
    for (const [dbType, codes] of Object.entries(types)) {
      for (const [code, target] of Object.entries(codes)) {
        if (!target.host || !target.database || !target.user) {
          console.warn(
            `[DbConfig] Incomplete configuration for ${clusterId}.${dbType}.${code}: missing host, database, or user`
          );
        }
      }
    }
  }

  return config;
}

/**
 * Load configuration from URL environment variables
 * 支持所有固定化数据库类型的环境变量
 *
 * 环境变量映射（固定 code）:
 * - DATABASE_URL → polardb_mysql/primary
 * - DATABASE_URL_READ_ONLY → polardb_mysql/read_only
 * - DATABASE_URL_RECORD → polardb_mysql/record
 * - DATABASE_URL_ADB → adb/adb
 *
 * 注意: REDIS_URL 不在此处理，因为 Redis 不支持 SQL 执行
 */
function loadFromUrlEnvVars(): DbConfig {
  const config: DbConfig = {};
  const clusterId = getClusterName();

  // DATABASE_URL → polardb_mysql/primary
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl && databaseUrl.startsWith('mysql')) {
    const parsed = parseMysqlUrl(databaseUrl);
    if (parsed) {
      if (!config[clusterId]) config[clusterId] = {};
      if (!config[clusterId]['polardb_mysql']) config[clusterId]['polardb_mysql'] = {};
      config[clusterId]['polardb_mysql']['primary'] = parsed;
      console.log('[DbConfig] Loaded DATABASE_URL → polardb_mysql/primary');
    }
  }

  // DATABASE_URL_READ_ONLY → polardb_mysql/read_only
  const databaseUrlReadOnly = process.env.DATABASE_URL_READ_ONLY;
  if (databaseUrlReadOnly && databaseUrlReadOnly.startsWith('mysql')) {
    const parsed = parseMysqlUrl(databaseUrlReadOnly);
    if (parsed) {
      if (!config[clusterId]) config[clusterId] = {};
      if (!config[clusterId]['polardb_mysql']) config[clusterId]['polardb_mysql'] = {};
      config[clusterId]['polardb_mysql']['read_only'] = parsed;
      console.log('[DbConfig] Loaded DATABASE_URL_READ_ONLY → polardb_mysql/read_only');
    }
  }

  // DATABASE_URL_RECORD → polardb_mysql/record
  const databaseUrlRecord = process.env.DATABASE_URL_RECORD;
  if (databaseUrlRecord && databaseUrlRecord.startsWith('mysql')) {
    const parsed = parseMysqlUrl(databaseUrlRecord);
    if (parsed) {
      if (!config[clusterId]) config[clusterId] = {};
      if (!config[clusterId]['polardb_mysql']) config[clusterId]['polardb_mysql'] = {};
      config[clusterId]['polardb_mysql']['record'] = parsed;
      console.log('[DbConfig] Loaded DATABASE_URL_RECORD → polardb_mysql/record');
    }
  }

  // DATABASE_URL_ADB → adb/adb（固定 code 为 adb）
  const databaseUrlAdb = process.env.DATABASE_URL_ADB;
  if (databaseUrlAdb && databaseUrlAdb.startsWith('mysql')) {
    const parsed = parseMysqlUrl(databaseUrlAdb);
    if (parsed) {
      if (!config[clusterId]) config[clusterId] = {};
      if (!config[clusterId]['adb']) config[clusterId]['adb'] = {};
      config[clusterId]['adb']['adb'] = parsed;
      console.log('[DbConfig] Loaded DATABASE_URL_ADB → adb/adb');
    }
  }

  return config;
}

/**
 * Get target configuration for a specific cluster/type/code combination
 */
export function getTargetConfig(
  clusterId: string,
  dbType: DbType | string,
  code: DbCode | string
): DbTarget | null {
  const config = loadDbConfig();
  return config[clusterId]?.[dbType]?.[code] ?? null;
}

/**
 * Get all configured target keys
 * Returns array of {clusterId, dbType, code} objects
 */
export function getAllTargets(): Array<{
  clusterId: string;
  dbType: string;
  code: string;
}> {
  const config = loadDbConfig();
  const targets: Array<{ clusterId: string; dbType: string; code: string }> = [];

  for (const [clusterId, types] of Object.entries(config)) {
    for (const [dbType, codes] of Object.entries(types)) {
      for (const code of Object.keys(codes)) {
        targets.push({ clusterId, dbType, code });
      }
    }
  }

  return targets;
}

/**
 * Clear cached configuration (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * 刷新配置（清除缓存并重新加载）
 */
export async function refreshDopplerConfig(): Promise<void> {
  // 清除 target-db-config 的缓存
  try {
    const { clearTargetDbConfigCache } = await import('../lib/doppler/target-db-config');
    clearTargetDbConfigCache();
  } catch {
    // 忽略导入错误
  }

  // 清除本地缓存并重新初始化
  cachedConfig = null;
  await initDbConfig();
}
