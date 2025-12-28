/**
 * Redis 客户端
 * 用于进程跟踪和 nonce 验证
 */

import Redis, { type RedisOptions } from 'ioredis';
import { getTargetDbConfig, parseRedisUrl } from '../doppler';

let redisClient: Redis | null = null;
let connectionPromise: Promise<Redis> | null = null;

/**
 * Redis 配置选项
 */
const REDIS_OPTIONS: Partial<RedisOptions> = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  connectTimeout: 5000,
  lazyConnect: true,
  retryStrategy: (times: number) => {
    if (times > 3) {
      return null; // 停止重试
    }
    return Math.min(times * 200, 1000);
  },
};

/**
 * 获取 Redis 客户端
 * 懒加载，使用单例模式
 */
export async function getRedisClient(): Promise<Redis> {
  // 如果已有连接且状态正常，直接返回
  if (redisClient && redisClient.status === 'ready') {
    return redisClient;
  }

  // 如果正在连接，等待连接完成
  if (connectionPromise) {
    return connectionPromise;
  }

  // 创建新连接
  connectionPromise = createRedisConnection();

  try {
    redisClient = await connectionPromise;
    return redisClient;
  } finally {
    connectionPromise = null;
  }
}

/**
 * 创建 Redis 连接
 */
async function createRedisConnection(): Promise<Redis> {
  // 从 Doppler 获取配置
  const config = await getTargetDbConfig();

  if (!config.redisUrl) {
    throw new Error(
      'Redis URL not configured. Configure REDIS_URL in the Target DB Doppler project (accessed via TARGET_DB_DOPPLER_TOKEN).'
    );
  }

  // 解析 Redis URL
  const parsed = parseRedisUrl(config.redisUrl);
  if (!parsed) {
    throw new Error('Failed to parse Redis URL');
  }

  console.log('[Redis] Connecting to Redis...', {
    host: parsed.host,
    port: parsed.port,
    database: parsed.database,
  });

  const client = new Redis({
    host: parsed.host,
    port: parsed.port,
    password: parsed.password ?? undefined,
    db: parsed.database,
    ...REDIS_OPTIONS,
  });

  // 连接
  await client.connect();

  // 测试连接
  await client.ping();

  console.log('[Redis] Connected successfully');

  // 监听错误
  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  client.on('close', () => {
    console.log('[Redis] Connection closed');
    redisClient = null;
  });

  return client;
}

/**
 * 关闭 Redis 连接
 * 用于优雅关闭
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    console.log('[Redis] Connection closed gracefully');
  }
}

/**
 * 检查 Redis 是否可用
 */
export async function isRedisAvailable(): Promise<boolean> {
  try {
    const client = await getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * 获取 Redis 连接状态
 */
export function getRedisStatus(): {
  connected: boolean;
  status: string;
} {
  return {
    connected: redisClient?.status === 'ready',
    status: redisClient?.status ?? 'disconnected',
  };
}
