/**
 * 配置检测相关类型定义
 * 用于集群和数据库配置的完整性和连通性检测
 */

import type { DbTargetTypeKey } from '../constants/db-types';

// ============================================================================
// 环境类型定义
// ============================================================================

/**
 * 集群环境类型
 */
export type ClusterEnvironment = 'dev' | 'pre' | 'prod';

/**
 * 检测级别
 * - config: 仅检查配置是否存在
 * - connection: 检查配置并测试数据库连接
 * - full: 完整检测（配置 + 连接 + Executor 调用）
 */
export type ConfigCheckLevel = 'config' | 'connection' | 'full';

// ============================================================================
// 单项检测结果
// ============================================================================

/**
 * 单个检测项的状态
 */
export type CheckItemStatus = 'success' | 'warning' | 'error' | 'skipped';

/**
 * 单个检测项的结果
 */
export interface CheckItemResult {
  /** 检测项标识 */
  key: string;
  /** 检测项名称（用于展示） */
  name: string;
  /** 检测状态 */
  status: CheckItemStatus;
  /** 状态描述 */
  message: string;
  /** 详细信息（可选） */
  details?: string;
  /** 延迟时间（毫秒，用于连接测试） */
  latencyMs?: number;
  /** 脱敏后的 URL（可选） */
  maskedUrl?: string;
  /** 是否必须 */
  required: boolean;
}

// ============================================================================
// 数据库配置检测
// ============================================================================

/**
 * 单个数据库目标的检测结果
 */
export interface DatabaseCheckResult {
  /** 数据库目标类型 key */
  targetTypeKey: DbTargetTypeKey;
  /** 显示名称 */
  displayName: string;
  /** 对应的环境变量名 */
  envVar: string;
  /** 配置状态 */
  configStatus: CheckItemResult;
  /** 连接状态（仅当 checkLevel >= 'connection' 时有值） */
  connectionStatus?: CheckItemResult;
  /** 是否在当前环境下必须配置 */
  required: boolean;
  /** 必须配置的原因（如果 required 为 true） */
  requiredReason?: string;
}

// ============================================================================
// 集群配置检测
// ============================================================================

/**
 * Executor 服务的检测结果
 */
export interface ExecutorCheckResult {
  /** Executor URL 配置状态 */
  urlStatus: CheckItemResult;
  /** 签名密钥配置状态 */
  signingSecretStatus: CheckItemResult;
  /** Executor 健康检查状态（仅当 checkLevel >= 'connection' 时有值） */
  healthStatus?: CheckItemResult;
  /** Executor URL（脱敏） */
  maskedUrl?: string;
}

/**
 * Doppler Token 的检测结果
 */
export interface DopplerTokenCheckResult {
  /** 集群 Doppler Token 状态 */
  clusterTokenStatus: CheckItemResult;
  /** 目标数据库 Doppler Token 状态 */
  targetDbTokenStatus?: CheckItemResult;
  /** Token 中包含的配置项数量 */
  secretCount?: number;
}

/**
 * 集群完整配置检测结果
 */
export interface ClusterConfigCheckResult {
  /** 集群名称 */
  clusterName: string;
  /** 集群显示名称 */
  clusterDisplayName: string;
  /** 检测级别 */
  checkLevel: ConfigCheckLevel;
  /** 检测时间戳 */
  timestamp: string;
  /** 检测耗时（毫秒） */
  durationMs: number;
  /** 环境类型 */
  environment: ClusterEnvironment;
  /** 总体状态 */
  overallStatus: CheckItemStatus;
  /** 总体消息 */
  overallMessage: string;
  /** Doppler Token 检测结果 */
  dopplerToken: DopplerTokenCheckResult;
  /** Executor 检测结果 */
  executor: ExecutorCheckResult;
  /** 各数据库目标的检测结果 */
  databases: DatabaseCheckResult[];
  /** 检测摘要 */
  summary: ConfigCheckSummary;
}

/**
 * 检测摘要
 */
export interface ConfigCheckSummary {
  /** 总检测项数 */
  total: number;
  /** 成功数 */
  success: number;
  /** 警告数 */
  warning: number;
  /** 错误数 */
  error: number;
  /** 跳过数 */
  skipped: number;
  /** 必须项总数 */
  requiredTotal: number;
  /** 必须项已配置数 */
  requiredConfigured: number;
  /** 缺失的必须配置项 */
  missingRequired: string[];
}

// ============================================================================
// API 请求和响应
// ============================================================================

/**
 * 配置检测请求参数
 */
export interface ConfigCheckRequest {
  /** 检测级别 */
  checkLevel?: ConfigCheckLevel;
  /** 是否强制刷新缓存 */
  forceRefresh?: boolean;
}

/**
 * 单个数据库连接测试请求
 */
export interface DatabaseConnectionTestRequest {
  /** 数据库目标类型 key */
  targetTypeKey: DbTargetTypeKey;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
}

/**
 * 单个数据库连接测试响应
 */
export interface DatabaseConnectionTestResponse {
  /** 是否成功 */
  success: boolean;
  /** 数据库目标类型 key */
  targetTypeKey: DbTargetTypeKey;
  /** 连接状态 */
  status: CheckItemStatus;
  /** 状态消息 */
  message: string;
  /** 延迟时间（毫秒） */
  latencyMs?: number;
  /** 错误详情 */
  errorDetails?: string;
}

// ============================================================================
// Executor 配置检测 API 响应
// ============================================================================

/**
 * Executor 配置检测响应
 */
export interface ExecutorConfigCheckResponse {
  /** 是否成功 */
  success: boolean;
  /** 集群名称 */
  clusterName: string;
  /** 检测时间戳 */
  timestamp: string;
  /** 检测耗时（毫秒） */
  durationMs: number;
  /** 各数据库的配置和连接状态 */
  databases: ExecutorDatabaseStatus[];
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * Executor 端单个数据库的状态
 */
export interface ExecutorDatabaseStatus {
  /** 数据库目标类型 key */
  targetTypeKey: DbTargetTypeKey;
  /** 环境变量名 */
  envVar: string;
  /** 显示名称 */
  displayName: string;
  /** 是否已配置 */
  configured: boolean;
  /** 脱敏后的 URL */
  maskedUrl?: string;
  /** 连接测试结果 */
  connectionTest?: {
    /** 是否成功 */
    success: boolean;
    /** 延迟时间（毫秒） */
    latencyMs?: number;
    /** 错误信息 */
    error?: string;
  };
}
