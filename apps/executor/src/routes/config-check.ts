/**
 * 配置检测 API
 * 用于检查数据库配置的完整性和连通性
 *
 * GET /api/v1/config/check - 检测所有数据库配置
 * GET /api/v1/config/check/:targetTypeKey - 检测单个数据库配置
 * POST /api/v1/config/test-connection - 测试单个数据库连接
 */

import { Hono } from 'hono';
import {
  DB_TARGET_TYPES,
  type DbTargetTypeKey,
  type DbTargetTypeConfig,
  isValidDbTargetTypeKey,
  maskDatabaseUrl,
} from '@sql-ops/shared';
import type {
  ExecutorConfigCheckResponse,
  ExecutorDatabaseStatus,
  DatabaseConnectionTestResponse,
} from '@sql-ops/shared';
import { getTargetDbConfig, clearTargetDbConfigCache } from '../lib/doppler/target-db-config';
import { checkTargetDbHealth } from '../db/health';

const configCheck = new Hono();

/**
 * 获取集群名称
 */
function getClusterName(): string {
  return (process.env.CLUSTER_NAME || 'default').toLowerCase();
}

/**
 * 根据 targetTypeKey 获取对应的环境变量值
 */
async function getEnvVarValue(targetTypeKey: DbTargetTypeKey): Promise<string | null> {
  const config = await getTargetDbConfig();
  const targetConfig = DB_TARGET_TYPES[targetTypeKey];

  switch (targetConfig.envVar) {
    case 'DATABASE_URL':
      return config.databaseUrl;
    case 'DATABASE_URL_READ_ONLY':
      return config.databaseUrlReadOnly;
    case 'DATABASE_URL_RECORD':
      return config.databaseUrlRecord;
    case 'DATABASE_URL_ADB':
      return config.databaseUrlAdb;
    case 'REDIS_URL':
      return config.redisUrl;
    default:
      return null;
  }
}

/**
 * 测试单个数据库连接
 */
async function testDatabaseConnection(
  targetTypeKey: DbTargetTypeKey,
  _timeoutMs: number = 5000
): Promise<{
  success: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const targetConfig = DB_TARGET_TYPES[targetTypeKey];
  const clusterId = getClusterName();

  // Redis 不支持 SQL 连接测试
  if (targetConfig.dbType === 'redis') {
    return {
      success: true,
      latencyMs: 0,
      error: undefined,
    };
  }

  try {
    const healthResult = await checkTargetDbHealth(clusterId, targetConfig.dbType, targetConfig.code);

    return {
      success: healthResult.available,
      latencyMs: healthResult.latencyMs,
      error: healthResult.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '连接测试失败',
    };
  }
}

/**
 * GET /api/v1/config/check
 * 检测所有数据库配置
 */
configCheck.get('/', async (c) => {
  const startTime = Date.now();
  const testConnection = c.req.query('testConnection') !== 'false';
  const forceRefresh = c.req.query('forceRefresh') === 'true';

  // 强制刷新缓存
  if (forceRefresh) {
    clearTargetDbConfigCache();
  }

  const clusterName = getClusterName();
  const databases: ExecutorDatabaseStatus[] = [];

  try {
    // 获取所有配置（确保缓存已初始化）
    await getTargetDbConfig();

    // 遍历所有固定化的数据库类型
    for (const [key, targetConfig] of Object.entries(DB_TARGET_TYPES) as [DbTargetTypeKey, DbTargetTypeConfig][]) {
      const targetTypeKey = key;
      const url = await getEnvVarValue(targetTypeKey);
      const configured = !!url;

      const dbStatus: ExecutorDatabaseStatus = {
        targetTypeKey,
        envVar: targetConfig.envVar,
        displayName: targetConfig.displayName,
        configured,
        maskedUrl: url ? maskDatabaseUrl(url) : undefined,
      };

      // 如果配置了且需要测试连接
      if (configured && testConnection && targetConfig.supportsSql) {
        dbStatus.connectionTest = await testDatabaseConnection(targetTypeKey);
      }

      databases.push(dbStatus);
    }

    const response: ExecutorConfigCheckResponse = {
      success: true,
      clusterName,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      databases,
    };

    return c.json(response);
  } catch (error) {
    const response: ExecutorConfigCheckResponse = {
      success: false,
      clusterName,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      databases,
      error: error instanceof Error ? error.message : '配置检测失败',
    };

    return c.json(response, 500);
  }
});

/**
 * GET /api/v1/config/check/:targetTypeKey
 * 检测单个数据库配置
 */
configCheck.get('/:targetTypeKey', async (c) => {
  const targetTypeKey = c.req.param('targetTypeKey');
  const testConnection = c.req.query('testConnection') !== 'false';

  if (!isValidDbTargetTypeKey(targetTypeKey)) {
    return c.json(
      {
        success: false,
        error: `无效的目标类型: ${targetTypeKey}`,
      },
      400
    );
  }

  const targetConfig = DB_TARGET_TYPES[targetTypeKey as DbTargetTypeKey];
  const url = await getEnvVarValue(targetTypeKey as DbTargetTypeKey);
  const configured = !!url;

  const dbStatus: ExecutorDatabaseStatus = {
    targetTypeKey: targetTypeKey as DbTargetTypeKey,
    envVar: targetConfig.envVar,
    displayName: targetConfig.displayName,
    configured,
    maskedUrl: url ? maskDatabaseUrl(url) : undefined,
  };

  // 如果配置了且需要测试连接
  if (configured && testConnection && targetConfig.supportsSql) {
    dbStatus.connectionTest = await testDatabaseConnection(targetTypeKey as DbTargetTypeKey);
  }

  return c.json({
    success: true,
    database: dbStatus,
  });
});

/**
 * POST /api/v1/config/test-connection
 * 测试单个数据库连接
 */
configCheck.post('/test-connection', async (c) => {
  const body = await c.req.json<{
    targetTypeKey: string;
    timeoutMs?: number;
  }>();

  const { targetTypeKey, timeoutMs = 5000 } = body;

  if (!isValidDbTargetTypeKey(targetTypeKey)) {
    const response: DatabaseConnectionTestResponse = {
      success: false,
      targetTypeKey: targetTypeKey as DbTargetTypeKey,
      status: 'error',
      message: `无效的目标类型: ${targetTypeKey}`,
    };
    return c.json(response, 400);
  }

  const typedKey = targetTypeKey as DbTargetTypeKey;
  const targetConfig = DB_TARGET_TYPES[typedKey];

  // 检查是否已配置
  const url = await getEnvVarValue(typedKey);
  if (!url) {
    const response: DatabaseConnectionTestResponse = {
      success: false,
      targetTypeKey: typedKey,
      status: 'error',
      message: `环境变量 ${targetConfig.envVar} 未配置`,
    };
    return c.json(response);
  }

  // 测试连接
  const connectionResult = await testDatabaseConnection(typedKey, timeoutMs);

  const response: DatabaseConnectionTestResponse = {
    success: connectionResult.success,
    targetTypeKey: typedKey,
    status: connectionResult.success ? 'success' : 'error',
    message: connectionResult.success
      ? `连接成功，延迟 ${connectionResult.latencyMs}ms`
      : connectionResult.error || '连接失败',
    latencyMs: connectionResult.latencyMs,
    errorDetails: connectionResult.error,
  };

  return c.json(response);
});

/**
 * POST /api/v1/config/refresh
 * 刷新配置缓存
 */
configCheck.post('/refresh', async (c) => {
  clearTargetDbConfigCache();

  return c.json({
    success: true,
    message: '配置缓存已刷新',
    timestamp: new Date().toISOString(),
  });
});

export { configCheck };
