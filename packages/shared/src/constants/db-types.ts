/**
 * Database type constants
 * Single source of truth for all database type definitions
 */

/**
 * Supported database types (大类型)
 */
export const DB_TYPES = ['polardb_mysql', 'adb', 'redis'] as const;

/**
 * Database type - union type derived from DB_TYPES
 */
export type DbType = (typeof DB_TYPES)[number];

/**
 * Default database type used when not specified
 */
export const DEFAULT_DB_TYPE: DbType = 'polardb_mysql';

/**
 * Type guard to check if a value is a valid DbType
 */
export function isValidDbType(value: string): value is DbType {
  return DB_TYPES.includes(value as DbType);
}

/**
 * Human-readable labels for database types
 */
export const DB_TYPE_LABELS: Record<DbType, string> = {
  polardb_mysql: 'PolarDB MySQL',
  adb: 'AnalyticDB',
  redis: 'Redis',
};

// ============================================================================
// 固定化数据库目标类型定义
// ============================================================================

/**
 * PolarDB MySQL 子类型
 */
export const POLARDB_SUBTYPES = ['primary', 'read_only', 'record'] as const;
export type PolarDbSubtype = (typeof POLARDB_SUBTYPES)[number];

/**
 * 数据库目标类型标识符
 */
export const DB_TARGET_TYPE_KEYS = [
  'polardb_mysql_primary',
  'polardb_mysql_read_only',
  'polardb_mysql_record',
  'adb',
  'redis',
] as const;
export type DbTargetTypeKey = (typeof DB_TARGET_TYPE_KEYS)[number];

/**
 * 数据库目标类型配置
 */
export interface DbTargetTypeConfig {
  /** 数据库大类型 */
  dbType: DbType;
  /** 子类型（仅 PolarDB MySQL 有） */
  subtype: PolarDbSubtype | null;
  /** 固定的数据库代号 */
  code: string;
  /** 固定的显示名称 */
  displayName: string;
  /** 对应的环境变量名 */
  envVar: string;
  /** 是否支持 SQL 执行 */
  supportsSql: boolean;
}

/**
 * 数据库目标类型定义
 * 包含所有固定的数据库类型及其配置
 */
export const DB_TARGET_TYPES: Record<DbTargetTypeKey, DbTargetTypeConfig> = {
  polardb_mysql_primary: {
    dbType: 'polardb_mysql',
    subtype: 'primary',
    code: 'primary',
    displayName: 'PolarDB MySQL 主库',
    envVar: 'DATABASE_URL',
    supportsSql: true,
  },
  polardb_mysql_read_only: {
    dbType: 'polardb_mysql',
    subtype: 'read_only',
    code: 'read_only',
    displayName: 'PolarDB MySQL 只读库',
    envVar: 'DATABASE_URL_READ_ONLY',
    supportsSql: true,
  },
  polardb_mysql_record: {
    dbType: 'polardb_mysql',
    subtype: 'record',
    code: 'record',
    displayName: 'PolarDB MySQL 日志库',
    envVar: 'DATABASE_URL_RECORD',
    supportsSql: true,
  },
  adb: {
    dbType: 'adb',
    subtype: null,
    code: 'adb',
    displayName: 'AnalyticDB (ADB)',
    envVar: 'DATABASE_URL_ADB',
    supportsSql: true,
  },
  redis: {
    dbType: 'redis',
    subtype: null,
    code: 'redis',
    displayName: 'Redis 缓存',
    envVar: 'REDIS_URL',
    supportsSql: false,
  },
} as const;

/**
 * 检查是否是有效的数据库目标类型标识符
 */
export function isValidDbTargetTypeKey(value: string): value is DbTargetTypeKey {
  return DB_TARGET_TYPE_KEYS.includes(value as DbTargetTypeKey);
}

/**
 * 根据 dbType 和 code 获取目标类型配置
 */
export function getDbTargetTypeConfig(
  dbType: string,
  code: string
): DbTargetTypeConfig | null {
  for (const config of Object.values(DB_TARGET_TYPES)) {
    if (config.dbType === dbType && config.code === code) {
      return config;
    }
  }
  return null;
}

/**
 * 根据 dbType 和 code 获取目标类型 key
 */
export function getDbTargetTypeKey(dbType: string, code: string): DbTargetTypeKey | null {
  for (const [key, config] of Object.entries(DB_TARGET_TYPES)) {
    if (config.dbType === dbType && config.code === code) {
      return key as DbTargetTypeKey;
    }
  }
  return null;
}

/**
 * 根据环境变量名获取目标类型配置
 */
export function getDbTargetTypeConfigByEnvVar(envVar: string): DbTargetTypeConfig | null {
  for (const config of Object.values(DB_TARGET_TYPES)) {
    if (config.envVar === envVar) {
      return config;
    }
  }
  return null;
}

/**
 * 获取指定 dbType 的所有子类型配置
 */
export function getSubtypesForDbType(dbType: DbType): DbTargetTypeConfig[] {
  return Object.values(DB_TARGET_TYPES).filter((config) => config.dbType === dbType);
}

/**
 * 获取所有支持 SQL 执行的数据库类型
 */
export function getSqlSupportedTargetTypes(): DbTargetTypeConfig[] {
  return Object.values(DB_TARGET_TYPES).filter((config) => config.supportsSql);
}

// 注意: DbCode 类型已在 types/statement.ts 中定义，不在此重复导出
