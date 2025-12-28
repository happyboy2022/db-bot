/**
 * Redis 进程跟踪器
 * 使用 Redis 存储 MySQL 进程状态，支持跨实例查询和终止
 */

import { getRedisClient } from './client';

/**
 * 进程状态
 */
export type ProcessStatus = 'running' | 'completed' | 'killed' | 'timeout';

/**
 * 进程信息
 */
export interface RedisProcessInfo {
  processId: number;
  clusterId: string;
  dbType: string;
  code: string;
  statementId: string;
  requestId: string;
  sql: string;
  startTime: number;
  timeoutMs: number;
  status: ProcessStatus;
  completedAt?: number;
  killedAt?: number;
  killReason?: string;
  error?: string;
}

/**
 * 跟踪进程的参数
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

// Redis 键前缀
const KEY_PREFIX = 'executor:process';

/**
 * 生成进程信息键
 */
function getProcessKey(clusterId: string, processId: number): string {
  return `${KEY_PREFIX}:${clusterId}:${processId}`;
}

/**
 * 生成进程列表键
 */
function getProcessListKey(clusterId: string, dbType: string, code: string): string {
  return `${KEY_PREFIX}:list:${clusterId}:${dbType}:${code}`;
}

/**
 * 跟踪新进程
 * 在 SQL 执行开始时调用
 */
export async function trackProcessInRedis(params: TrackProcessParams): Promise<void> {
  const redis = await getRedisClient();

  const key = getProcessKey(params.clusterId, params.processId);
  const listKey = getProcessListKey(params.clusterId, params.dbType, params.code);

  // TTL = 超时时间 + 10 分钟缓冲
  const ttlSeconds = Math.ceil((params.timeoutMs + 10 * 60 * 1000) / 1000);

  const now = Date.now();

  const pipeline = redis.pipeline();

  // 存储进程信息
  pipeline.hset(key, {
    processId: params.processId.toString(),
    clusterId: params.clusterId,
    dbType: params.dbType,
    code: params.code,
    statementId: params.statementId,
    requestId: params.requestId,
    sql: params.sql.substring(0, 500), // 限制 SQL 长度
    startTime: now.toString(),
    timeoutMs: params.timeoutMs.toString(),
    status: 'running',
  });
  pipeline.expire(key, ttlSeconds);

  // 添加到进程列表（按开始时间排序）
  pipeline.zadd(listKey, now, params.processId.toString());
  pipeline.expire(listKey, ttlSeconds);

  await pipeline.exec();

  console.log('[ProcessTracker] Tracked process in Redis:', {
    processId: params.processId,
    statementId: params.statementId,
    clusterId: params.clusterId,
  });
}

/**
 * 获取进程信息
 */
export async function getProcessFromRedis(
  clusterId: string,
  processId: number
): Promise<RedisProcessInfo | null> {
  const redis = await getRedisClient();
  const key = getProcessKey(clusterId, processId);

  const data = await redis.hgetall(key);

  if (!Object.keys(data).length) {
    return null;
  }

  return {
    processId: parseInt(data.processId, 10),
    clusterId: data.clusterId,
    dbType: data.dbType,
    code: data.code,
    statementId: data.statementId,
    requestId: data.requestId,
    sql: data.sql,
    startTime: parseInt(data.startTime, 10),
    timeoutMs: parseInt(data.timeoutMs, 10),
    status: data.status as ProcessStatus,
    completedAt: data.completedAt ? parseInt(data.completedAt, 10) : undefined,
    killedAt: data.killedAt ? parseInt(data.killedAt, 10) : undefined,
    killReason: data.killReason,
    error: data.error,
  };
}

/**
 * 检查是否是系统进程
 */
export async function isSystemProcessInRedis(
  clusterId: string,
  processId: number
): Promise<boolean> {
  const redis = await getRedisClient();
  const key = getProcessKey(clusterId, processId);
  return (await redis.exists(key)) === 1;
}

/**
 * 列出活跃进程
 */
export async function listProcessesFromRedis(
  clusterId: string,
  dbType: string,
  code: string
): Promise<RedisProcessInfo[]> {
  const redis = await getRedisClient();
  const listKey = getProcessListKey(clusterId, dbType, code);

  // 获取进程 ID 列表（按开始时间排序，最新的在前）
  const processIds = await redis.zrevrange(listKey, 0, 100);

  if (!processIds.length) {
    return [];
  }

  // 批量获取进程信息
  const pipeline = redis.pipeline();
  for (const pid of processIds) {
    const key = getProcessKey(clusterId, parseInt(pid, 10));
    pipeline.hgetall(key);
  }

  const results = await pipeline.exec();
  if (!results) {
    return [];
  }

  const processes: RedisProcessInfo[] = [];

  for (const [error, data] of results) {
    if (error) continue;

    const record = data as Record<string, string>;
    if (!record || !Object.keys(record).length) continue;

    processes.push({
      processId: parseInt(record.processId, 10),
      clusterId: record.clusterId,
      dbType: record.dbType,
      code: record.code,
      statementId: record.statementId,
      requestId: record.requestId,
      sql: record.sql,
      startTime: parseInt(record.startTime, 10),
      timeoutMs: parseInt(record.timeoutMs, 10),
      status: record.status as ProcessStatus,
      completedAt: record.completedAt ? parseInt(record.completedAt, 10) : undefined,
      killedAt: record.killedAt ? parseInt(record.killedAt, 10) : undefined,
      killReason: record.killReason,
      error: record.error,
    });
  }

  return processes;
}

/**
 * 标记进程完成
 */
export async function completeProcessInRedis(
  clusterId: string,
  processId: number,
  error?: string
): Promise<void> {
  const redis = await getRedisClient();
  const key = getProcessKey(clusterId, processId);

  const now = Date.now();

  // 更新状态
  const updates: Record<string, string> = {
    status: error ? 'timeout' : 'completed',
    completedAt: now.toString(),
  };

  if (error) {
    updates.error = error;
  }

  await redis.hset(key, updates);

  // 设置较短 TTL 用于历史记录
  await redis.expire(key, 5 * 60); // 5 分钟

  console.log('[ProcessTracker] Process completed:', {
    processId,
    clusterId,
    status: updates.status,
  });
}

/**
 * 标记进程被终止
 */
export async function killProcessInRedis(
  clusterId: string,
  processId: number,
  reason: string
): Promise<void> {
  const redis = await getRedisClient();
  const key = getProcessKey(clusterId, processId);

  const now = Date.now();

  await redis.hset(key, {
    status: 'killed',
    killedAt: now.toString(),
    killReason: reason,
  });

  // 设置较短 TTL 用于历史记录
  await redis.expire(key, 5 * 60); // 5 分钟

  console.log('[ProcessTracker] Process killed:', {
    processId,
    clusterId,
    reason,
  });
}

/**
 * 删除进程记录
 * 用于清理已完成的进程
 */
export async function removeProcessFromRedis(
  clusterId: string,
  dbType: string,
  code: string,
  processId: number
): Promise<void> {
  const redis = await getRedisClient();

  const key = getProcessKey(clusterId, processId);
  const listKey = getProcessListKey(clusterId, dbType, code);

  const pipeline = redis.pipeline();
  pipeline.del(key);
  pipeline.zrem(listKey, processId.toString());
  await pipeline.exec();
}

/**
 * 获取进程跟踪统计
 */
export async function getProcessTrackerStats(
  clusterId: string,
  dbType: string,
  code: string
): Promise<{
  total: number;
  running: number;
  completed: number;
  killed: number;
}> {
  const processes = await listProcessesFromRedis(clusterId, dbType, code);

  return {
    total: processes.length,
    running: processes.filter((p) => p.status === 'running').length,
    completed: processes.filter((p) => p.status === 'completed').length,
    killed: processes.filter((p) => p.status === 'killed').length,
  };
}
