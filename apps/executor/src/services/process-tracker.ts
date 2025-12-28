/**
 * Process ID tracker for executed SQL statements
 * 使用 Redis 存储进程状态，支持跨 Serverless 实例共享
 *
 * 重要：此模块强制使用 Redis，不支持内存降级
 * 原因：Serverless 环境中内存不可靠，实例可能随时被回收
 */

import {
  trackProcessInRedis,
  getProcessFromRedis,
  isSystemProcessInRedis,
  listProcessesFromRedis,
  completeProcessInRedis,
  killProcessInRedis,
  isRedisAvailable,
  type RedisProcessInfo,
} from '../lib/redis';

// Re-export types
export type { RedisProcessInfo };

/**
 * Redis 不可用错误
 */
export class RedisUnavailableError extends Error {
  constructor(message = 'Redis 连接失败，无法追踪请求状态') {
    super(message);
    this.name = 'RedisUnavailableError';
  }
}

/**
 * 检查 Redis 是否可用
 * 如果不可用，抛出错误（不再降级到内存模式）
 */
export async function ensureRedisAvailable(): Promise<void> {
  const available = await isRedisAvailable();
  if (!available) {
    throw new RedisUnavailableError();
  }
}

/**
 * 跟踪进程参数
 */
export interface TrackProcessParams {
  clusterId: string;
  dbType: string;
  code: string;
  processId: number;
  statementId: string;
  requestId: string;
  sql: string;
  timeoutMs: number;
}

/**
 * 跟踪 MySQL 进程 ID
 * @throws {RedisUnavailableError} 当 Redis 不可用时
 */
export async function trackProcess(params: TrackProcessParams): Promise<void> {
  await ensureRedisAvailable();
  await trackProcessInRedis(params);
}

/**
 * 获取进程信息
 * @throws {RedisUnavailableError} 当 Redis 不可用时
 */
export async function getProcessInfo(
  clusterId: string,
  processId: number
): Promise<RedisProcessInfo | null> {
  await ensureRedisAvailable();
  return getProcessFromRedis(clusterId, processId);
}

/**
 * 检查是否是系统进程
 * @throws {RedisUnavailableError} 当 Redis 不可用时
 */
export async function isSystemOwnedProcess(
  clusterId: string,
  processId: number
): Promise<boolean> {
  await ensureRedisAvailable();
  return isSystemProcessInRedis(clusterId, processId);
}

/**
 * 标记进程完成
 * @throws {RedisUnavailableError} 当 Redis 不可用时
 */
export async function completeProcess(
  clusterId: string,
  processId: number,
  error?: string
): Promise<void> {
  await ensureRedisAvailable();
  await completeProcessInRedis(clusterId, processId, error);
}

/**
 * 标记进程被终止
 * @throws {RedisUnavailableError} 当 Redis 不可用时
 */
export async function killProcess(
  clusterId: string,
  processId: number,
  reason: string
): Promise<void> {
  await ensureRedisAvailable();
  await killProcessInRedis(clusterId, processId, reason);
}

/**
 * 列出活跃进程
 * @throws {RedisUnavailableError} 当 Redis 不可用时
 */
export async function listProcesses(
  clusterId: string,
  dbType: string,
  code: string
): Promise<RedisProcessInfo[]> {
  await ensureRedisAvailable();
  return listProcessesFromRedis(clusterId, dbType, code);
}

/**
 * 删除进程记录
 * @throws {RedisUnavailableError} 当 Redis 不可用时
 */
export async function untrackProcess(
  clusterId: string,
  processId: number
): Promise<void> {
  await ensureRedisAvailable();
  await completeProcessInRedis(clusterId, processId);
}

/**
 * 获取当前模式（始终返回 'redis'）
 */
export function getTrackerMode(): 'redis' {
  return 'redis';
}
