/**
 * Request Tracker for Redis
 * 请求级别追踪，支持 RID -> PID 映射
 *
 * 核心功能：
 * 1. 追踪请求状态（pending -> executing -> completed/failed/terminated）
 * 2. 在获取 processId 后立即更新追踪
 * 3. 支持通过 requestId 终止执行
 * 4. 预终止机制（请求尚未到达时设置终止标记）
 * 5. 列出当前执行中的请求
 */

import { getRedisClient } from './client';

/**
 * 请求状态
 */
export type RequestStatus =
  | 'pending'    // 请求已接收，尚未开始执行
  | 'executing'  // 正在执行 SQL
  | 'completed'  // 执行成功完成
  | 'failed'     // 执行失败
  | 'terminated'; // 被终止

/**
 * 请求追踪信息
 */
export interface RequestInfo {
  requestId: string;
  statementId: string;
  clusterId: string;
  dbType: string;
  code: string;
  processId: number | null;
  status: RequestStatus;
  sql: string;
  startedAt: number;
  timeoutMs: number;
  completedAt: number | null;
  terminatedAt: number | null;
  terminatedBy: string | null;
  terminateReason: string | null;
  error: string | null;
}

/**
 * 追踪请求参数
 */
export interface TrackRequestParams {
  requestId: string;
  statementId: string;
  clusterId: string;
  dbType: string;
  code: string;
  sql: string;
  timeoutMs: number;
}

/**
 * 预终止信息
 */
export interface PreTerminateInfo {
  terminatedAt: number;
  reason: string;
  terminatedBy: string;
}

/**
 * 终止结果
 */
export interface TerminateResult {
  success: boolean;
  killed: boolean;
  processId: number | null;
  wasExecuting: boolean;
  error: string | null;
}

/**
 * 请求过滤器
 */
export interface RequestFilter {
  clusterId?: string;
  dbType?: string;
  code?: string;
}

// Redis 键前缀
const REQUEST_KEY_PREFIX = 'executor:request';
const TERMINATE_KEY_PREFIX = 'executor:terminate';
const EXECUTING_SET_PREFIX = 'executor:executing';

// TTL 配置
const PRE_TERMINATE_TTL_SECONDS = 2 * 60; // 2 分钟

/**
 * 生成请求追踪键
 */
function getRequestKey(requestId: string): string {
  return `${REQUEST_KEY_PREFIX}:${requestId}`;
}

/**
 * 生成预终止键
 */
function getPreTerminateKey(requestId: string): string {
  return `${TERMINATE_KEY_PREFIX}:${requestId}`;
}

/**
 * 生成执行中请求集合键
 */
function getExecutingSetKey(clusterId: string, dbType: string, code: string): string {
  return `${EXECUTING_SET_PREFIX}:${clusterId}:${dbType}:${code}`;
}

/**
 * 追踪新请求
 * 在执行开始前调用，状态为 pending
 */
export async function trackRequest(params: TrackRequestParams): Promise<void> {
  const redis = await getRedisClient();
  const key = getRequestKey(params.requestId);

  // TTL = 超时时间 + 30 分钟缓冲
  const ttlSeconds = Math.ceil((params.timeoutMs + 30 * 60 * 1000) / 1000);

  const now = Date.now();

  await redis.hset(key, {
    requestId: params.requestId,
    statementId: params.statementId,
    clusterId: params.clusterId,
    dbType: params.dbType,
    code: params.code,
    processId: '',
    status: 'pending',
    sql: params.sql.substring(0, 500), // 限制 SQL 长度
    startedAt: now.toString(),
    timeoutMs: params.timeoutMs.toString(),
    completedAt: '',
    terminatedAt: '',
    terminatedBy: '',
    terminateReason: '',
    error: '',
  });

  await redis.expire(key, ttlSeconds);

  console.log('[RequestTracker] Tracked request:', {
    requestId: params.requestId,
    statementId: params.statementId,
    clusterId: params.clusterId,
  });
}

/**
 * 更新请求状态为 executing，并记录 processId
 * 在获取 CONNECTION_ID() 后立即调用
 */
export async function updateRequestExecuting(
  requestId: string,
  processId: number
): Promise<void> {
  const redis = await getRedisClient();
  const key = getRequestKey(requestId);

  // 获取请求信息以添加到执行中集合
  const data = await redis.hgetall(key);
  if (!Object.keys(data).length) {
    console.warn('[RequestTracker] Request not found:', requestId);
    return;
  }

  const pipeline = redis.pipeline();

  // 更新请求状态
  pipeline.hset(key, {
    processId: processId.toString(),
    status: 'executing',
  });

  // 添加到执行中请求集合
  const setKey = getExecutingSetKey(data.clusterId, data.dbType, data.code);
  pipeline.sadd(setKey, requestId);

  // 设置集合过期时间
  const ttlSeconds = Math.ceil((parseInt(data.timeoutMs, 10) + 30 * 60 * 1000) / 1000);
  pipeline.expire(setKey, ttlSeconds);

  await pipeline.exec();

  console.log('[RequestTracker] Request executing:', {
    requestId,
    processId,
    clusterId: data.clusterId,
  });
}

/**
 * 更新请求状态
 */
export async function updateRequestStatus(
  requestId: string,
  status: RequestStatus,
  error?: string
): Promise<void> {
  const redis = await getRedisClient();
  const key = getRequestKey(requestId);

  const updates: Record<string, string> = {
    status,
  };

  if (status === 'completed' || status === 'failed') {
    updates.completedAt = Date.now().toString();
  }

  if (error) {
    updates.error = error;
  }

  // 获取请求信息以从执行中集合移除
  const data = await redis.hgetall(key);

  const pipeline = redis.pipeline();
  pipeline.hset(key, updates);

  // 如果状态为完成/失败/终止，从执行中集合移除
  if (
    (status === 'completed' || status === 'failed' || status === 'terminated') &&
    Object.keys(data).length
  ) {
    const setKey = getExecutingSetKey(data.clusterId, data.dbType, data.code);
    pipeline.srem(setKey, requestId);
  }

  // 设置较短 TTL 用于历史记录
  pipeline.expire(key, 5 * 60); // 5 分钟

  await pipeline.exec();

  console.log('[RequestTracker] Request status updated:', {
    requestId,
    status,
    error: error || null,
  });
}

/**
 * 获取请求状态
 */
export async function getRequestStatus(requestId: string): Promise<RequestInfo | null> {
  const redis = await getRedisClient();
  const key = getRequestKey(requestId);

  const data = await redis.hgetall(key);

  if (!Object.keys(data).length) {
    return null;
  }

  return {
    requestId: data.requestId,
    statementId: data.statementId,
    clusterId: data.clusterId,
    dbType: data.dbType,
    code: data.code,
    processId: data.processId ? parseInt(data.processId, 10) : null,
    status: data.status as RequestStatus,
    sql: data.sql,
    startedAt: parseInt(data.startedAt, 10),
    timeoutMs: parseInt(data.timeoutMs, 10),
    completedAt: data.completedAt ? parseInt(data.completedAt, 10) : null,
    terminatedAt: data.terminatedAt ? parseInt(data.terminatedAt, 10) : null,
    terminatedBy: data.terminatedBy || null,
    terminateReason: data.terminateReason || null,
    error: data.error || null,
  };
}

/**
 * 标记请求被终止
 */
export async function markRequestTerminated(
  requestId: string,
  reason: string,
  terminatedBy: string
): Promise<void> {
  const redis = await getRedisClient();
  const key = getRequestKey(requestId);

  const now = Date.now();

  // 获取请求信息以从执行中集合移除
  const data = await redis.hgetall(key);

  const pipeline = redis.pipeline();

  pipeline.hset(key, {
    status: 'terminated',
    terminatedAt: now.toString(),
    terminatedBy,
    terminateReason: reason,
  });

  // 从执行中集合移除
  if (Object.keys(data).length) {
    const setKey = getExecutingSetKey(data.clusterId, data.dbType, data.code);
    pipeline.srem(setKey, requestId);
  }

  // 设置较短 TTL 用于历史记录
  pipeline.expire(key, 5 * 60); // 5 分钟

  await pipeline.exec();

  console.log('[RequestTracker] Request terminated:', {
    requestId,
    reason,
    terminatedBy,
  });
}

/**
 * 列出执行中的请求
 */
export async function listExecutingRequests(filter: RequestFilter): Promise<RequestInfo[]> {
  const redis = await getRedisClient();

  // 如果提供了完整的过滤条件，使用集合查询
  if (filter.clusterId && filter.dbType && filter.code) {
    const setKey = getExecutingSetKey(filter.clusterId, filter.dbType, filter.code);
    const requestIds = await redis.smembers(setKey);

    if (!requestIds.length) {
      return [];
    }

    // 批量获取请求信息
    const pipeline = redis.pipeline();
    for (const requestId of requestIds) {
      pipeline.hgetall(getRequestKey(requestId));
    }

    const results = await pipeline.exec();
    if (!results) {
      return [];
    }

    const requests: RequestInfo[] = [];
    for (const [error, data] of results) {
      if (error) continue;

      const record = data as Record<string, string>;
      if (!record || !Object.keys(record).length) continue;

      // 只返回正在执行的请求
      if (record.status !== 'executing') continue;

      requests.push({
        requestId: record.requestId,
        statementId: record.statementId,
        clusterId: record.clusterId,
        dbType: record.dbType,
        code: record.code,
        processId: record.processId ? parseInt(record.processId, 10) : null,
        status: record.status as RequestStatus,
        sql: record.sql,
        startedAt: parseInt(record.startedAt, 10),
        timeoutMs: parseInt(record.timeoutMs, 10),
        completedAt: record.completedAt ? parseInt(record.completedAt, 10) : null,
        terminatedAt: record.terminatedAt ? parseInt(record.terminatedAt, 10) : null,
        terminatedBy: record.terminatedBy || null,
        terminateReason: record.terminateReason || null,
        error: record.error || null,
      });
    }

    return requests;
  }

  // 如果没有完整过滤条件，扫描所有执行中集合
  // 注意：这个操作可能较慢，应该避免频繁调用
  let cursor = '0';
  const requestIds: string[] = [];

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      `${EXECUTING_SET_PREFIX}:*`,
      'COUNT',
      100
    );
    cursor = nextCursor;

    for (const key of keys) {
      const ids = await redis.smembers(key);
      requestIds.push(...ids);
    }
  } while (cursor !== '0');

  if (!requestIds.length) {
    return [];
  }

  // 批量获取请求信息并过滤
  const pipeline = redis.pipeline();
  for (const requestId of requestIds) {
    pipeline.hgetall(getRequestKey(requestId));
  }

  const results = await pipeline.exec();
  if (!results) {
    return [];
  }

  const requests: RequestInfo[] = [];
  for (const [error, data] of results) {
    if (error) continue;

    const record = data as Record<string, string>;
    if (!record || !Object.keys(record).length) continue;

    // 只返回正在执行的请求
    if (record.status !== 'executing') continue;

    // 应用过滤条件
    if (filter.clusterId && record.clusterId !== filter.clusterId) continue;
    if (filter.dbType && record.dbType !== filter.dbType) continue;
    if (filter.code && record.code !== filter.code) continue;

    requests.push({
      requestId: record.requestId,
      statementId: record.statementId,
      clusterId: record.clusterId,
      dbType: record.dbType,
      code: record.code,
      processId: record.processId ? parseInt(record.processId, 10) : null,
      status: record.status as RequestStatus,
      sql: record.sql,
      startedAt: parseInt(record.startedAt, 10),
      timeoutMs: parseInt(record.timeoutMs, 10),
      completedAt: record.completedAt ? parseInt(record.completedAt, 10) : null,
      terminatedAt: record.terminatedAt ? parseInt(record.terminatedAt, 10) : null,
      terminatedBy: record.terminatedBy || null,
      terminateReason: record.terminateReason || null,
      error: record.error || null,
    });
  }

  return requests;
}

/**
 * 设置预终止标记
 * 用于在请求尚未到达时提前设置终止标记
 */
export async function setPreTerminate(
  requestId: string,
  reason: string,
  terminatedBy: string = 'user'
): Promise<void> {
  const redis = await getRedisClient();
  const key = getPreTerminateKey(requestId);

  const data: PreTerminateInfo = {
    terminatedAt: Date.now(),
    reason,
    terminatedBy,
  };

  await redis.setex(key, PRE_TERMINATE_TTL_SECONDS, JSON.stringify(data));

  console.log('[RequestTracker] Pre-terminate set:', {
    requestId,
    reason,
    terminatedBy,
    ttlSeconds: PRE_TERMINATE_TTL_SECONDS,
  });
}

/**
 * 检查预终止标记
 * 如果存在预终止标记，返回标记信息
 */
export async function checkPreTerminate(requestId: string): Promise<PreTerminateInfo | null> {
  const redis = await getRedisClient();
  const key = getPreTerminateKey(requestId);

  const data = await redis.get(key);
  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data) as PreTerminateInfo;
  } catch {
    console.warn('[RequestTracker] Failed to parse pre-terminate data:', data);
    return null;
  }
}

/**
 * 清除预终止标记
 */
export async function clearPreTerminate(requestId: string): Promise<void> {
  const redis = await getRedisClient();
  const key = getPreTerminateKey(requestId);
  await redis.del(key);
}

/**
 * 获取请求追踪统计
 */
export async function getRequestTrackerStats(
  clusterId: string,
  dbType: string,
  code: string
): Promise<{
  executing: number;
}> {
  const redis = await getRedisClient();
  const setKey = getExecutingSetKey(clusterId, dbType, code);

  const count = await redis.scard(setKey);

  return {
    executing: count,
  };
}
