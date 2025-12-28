/**
 * 环境类型判断和配置必需性规则
 * 用于根据集群名称判断环境类型，并确定各配置项的必需性
 */

import type { ClusterEnvironment } from '../types/config-check';
import type { DbTargetTypeKey } from './db-types';

// ============================================================================
// 环境类型判断
// ============================================================================

/**
 * 开发环境集群名称模式
 * 匹配: dev, local, development
 */
const DEV_PATTERNS = ['dev', 'local', 'development'];

/**
 * 预发布环境集群名称模式
 * 匹配: pre, staging, stg, test
 */
const PRE_PATTERNS = ['pre', 'staging', 'stg', 'test'];

/**
 * 根据集群名称判断环境类型
 *
 * @param clusterName 集群名称（如 dev, pre, us-1, sg-1）
 * @returns 环境类型
 */
export function getClusterEnvironment(clusterName: string): ClusterEnvironment {
  const normalizedName = clusterName.toLowerCase().replace(/-/g, '_');

  // 检查是否匹配开发环境模式
  if (DEV_PATTERNS.some((pattern) => normalizedName.includes(pattern))) {
    return 'dev';
  }

  // 检查是否匹配预发布环境模式
  if (PRE_PATTERNS.some((pattern) => normalizedName.includes(pattern))) {
    return 'pre';
  }

  // 默认为生产环境
  return 'prod';
}

/**
 * 判断是否为生产环境
 */
export function isProductionEnvironment(clusterName: string): boolean {
  return getClusterEnvironment(clusterName) === 'prod';
}

/**
 * 判断是否为开发或预发布环境
 */
export function isNonProductionEnvironment(clusterName: string): boolean {
  const env = getClusterEnvironment(clusterName);
  return env === 'dev' || env === 'pre';
}

// ============================================================================
// 配置必需性规则
// ============================================================================

/**
 * 数据库配置必需性规则
 */
export interface DatabaseRequirementRule {
  /** 数据库目标类型 key */
  targetTypeKey: DbTargetTypeKey;
  /** 在开发环境是否必须 */
  requiredInDev: boolean;
  /** 在预发布环境是否必须 */
  requiredInPre: boolean;
  /** 在生产环境是否必须 */
  requiredInProd: boolean;
  /** 必须配置的原因说明 */
  requiredReason: string;
}

/**
 * 数据库配置必需性规则定义
 *
 * 规则说明：
 * - PolarDB MySQL 主库：所有环境必须
 * - PolarDB MySQL 只读库：所有环境可选
 * - PolarDB MySQL 日志库：DEV/PRE 可选，PROD 必须
 * - AnalyticDB：所有环境可选
 * - Redis：所有环境可选
 */
export const DATABASE_REQUIREMENT_RULES: DatabaseRequirementRule[] = [
  {
    targetTypeKey: 'polardb_mysql_primary',
    requiredInDev: true,
    requiredInPre: true,
    requiredInProd: true,
    requiredReason: '主库是执行 SQL 请求的核心数据库，必须配置',
  },
  {
    targetTypeKey: 'polardb_mysql_read_only',
    requiredInDev: false,
    requiredInPre: false,
    requiredInProd: false,
    requiredReason: '只读库用于读取操作，可选配置',
  },
  {
    targetTypeKey: 'polardb_mysql_record',
    requiredInDev: false,
    requiredInPre: false,
    requiredInProd: true,
    requiredReason: '生产环境必须配置日志库以存储记录型数据，减少主库存储压力',
  },
  {
    targetTypeKey: 'adb',
    requiredInDev: false,
    requiredInPre: false,
    requiredInProd: false,
    requiredReason: 'AnalyticDB 用于分析查询，可选配置',
  },
  {
    targetTypeKey: 'redis',
    requiredInDev: false,
    requiredInPre: false,
    requiredInProd: false,
    requiredReason: 'Redis 用于缓存，可选配置',
  },
];

/**
 * 获取数据库配置必需性规则的 Map
 */
export function getDatabaseRequirementRulesMap(): Map<DbTargetTypeKey, DatabaseRequirementRule> {
  return new Map(DATABASE_REQUIREMENT_RULES.map((rule) => [rule.targetTypeKey, rule]));
}

/**
 * 检查指定数据库在指定环境下是否必须配置
 *
 * @param targetTypeKey 数据库目标类型 key
 * @param environment 环境类型
 * @returns 是否必须配置
 */
export function isDatabaseRequired(
  targetTypeKey: DbTargetTypeKey,
  environment: ClusterEnvironment
): boolean {
  const rule = DATABASE_REQUIREMENT_RULES.find((r) => r.targetTypeKey === targetTypeKey);
  if (!rule) {
    return false;
  }

  switch (environment) {
    case 'dev':
      return rule.requiredInDev;
    case 'pre':
      return rule.requiredInPre;
    case 'prod':
      return rule.requiredInProd;
    default:
      return false;
  }
}

/**
 * 获取指定数据库配置必须的原因
 *
 * @param targetTypeKey 数据库目标类型 key
 * @returns 必须配置的原因，如果不必须则返回 undefined
 */
export function getDatabaseRequiredReason(targetTypeKey: DbTargetTypeKey): string | undefined {
  const rule = DATABASE_REQUIREMENT_RULES.find((r) => r.targetTypeKey === targetTypeKey);
  return rule?.requiredReason;
}

/**
 * 获取指定环境下所有必须配置的数据库类型
 *
 * @param environment 环境类型
 * @returns 必须配置的数据库目标类型 key 列表
 */
export function getRequiredDatabases(environment: ClusterEnvironment): DbTargetTypeKey[] {
  return DATABASE_REQUIREMENT_RULES.filter((rule) => {
    switch (environment) {
      case 'dev':
        return rule.requiredInDev;
      case 'pre':
        return rule.requiredInPre;
      case 'prod':
        return rule.requiredInProd;
      default:
        return false;
    }
  }).map((rule) => rule.targetTypeKey);
}

// ============================================================================
// 环境类型标签
// ============================================================================

/**
 * 环境类型的中文标签
 */
export const ENVIRONMENT_LABELS: Record<ClusterEnvironment, string> = {
  dev: '开发环境',
  pre: '预发布环境',
  prod: '生产环境',
};

/**
 * 获取环境类型的中文标签
 */
export function getEnvironmentLabel(environment: ClusterEnvironment): string {
  return ENVIRONMENT_LABELS[environment];
}
