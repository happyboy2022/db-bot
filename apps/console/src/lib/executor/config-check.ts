/**
 * Executor 配置检测客户端
 * 调用 Executor 的配置检测 API 并处理结果
 */

import type {
  ExecutorConfigCheckResponse,
  DatabaseConnectionTestResponse,
  ClusterConfigCheckResult,
  DatabaseCheckResult,
  ConfigCheckSummary,
  CheckItemResult,
  ConfigCheckLevel,
} from '@sql-ops/shared';
import {
  DB_TARGET_TYPES,
  type DbTargetTypeKey,
  getClusterEnvironment,
  isDatabaseRequired,
  getDatabaseRequiredReason,
  getRequiredDatabases,
  getEnvironmentLabel,
} from '@sql-ops/shared';
import { getExecutorConfig, checkClusterEnvStatus, isUsingFallbackConfig } from './config';
import { createSignedHeaders, getSigningSecret } from './signing';
import { getClusterTargetDbStatus, testTargetDbConfig } from '@/lib/doppler';

/**
 * 调用 Executor 的配置检测 API
 */
export async function fetchExecutorConfigCheck(
  clusterIdOrName: string,
  options: {
    testConnection?: boolean;
    forceRefresh?: boolean;
  } = {}
): Promise<ExecutorConfigCheckResponse | null> {
  const { testConnection = true, forceRefresh = false } = options;

  try {
    const config = await getExecutorConfig(clusterIdOrName);
    const path = '/api/v1/config/check';
    const queryParams = new URLSearchParams();
    if (!testConnection) {
      queryParams.set('testConnection', 'false');
    }
    if (forceRefresh) {
      queryParams.set('forceRefresh', 'true');
    }
    const fullPath = queryParams.toString() ? `${path}?${queryParams}` : path;

    // 添加时间戳确保请求唯一性
    const body = JSON.stringify({ requestTime: Date.now() });
    const signedHeaders = createSignedHeaders('GET', fullPath, '', {
      secret: config.signingSecret,
    });

    const response = await fetch(`${config.url}${fullPath}`, {
      method: 'GET',
      headers: {
        ...signedHeaders,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error(`[ConfigCheck] Executor returned ${response.status}`);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[ConfigCheck] Failed to fetch from Executor:', error);
    return null;
  }
}

/**
 * 测试单个数据库的连接
 */
export async function testDatabaseConnection(
  clusterIdOrName: string,
  targetTypeKey: DbTargetTypeKey,
  timeoutMs: number = 5000
): Promise<DatabaseConnectionTestResponse> {
  try {
    const config = await getExecutorConfig(clusterIdOrName);
    const path = '/api/v1/config/test-connection';
    const body = JSON.stringify({
      targetTypeKey,
      timeoutMs,
      requestTime: Date.now(),
    });

    const signedHeaders = createSignedHeaders('POST', path, body, {
      secret: config.signingSecret,
    });

    const response = await fetch(`${config.url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...signedHeaders,
      },
      body,
      cache: 'no-store',
    });

    return await response.json();
  } catch (error) {
    return {
      success: false,
      targetTypeKey,
      status: 'error',
      message: error instanceof Error ? error.message : '连接测试失败',
    };
  }
}

/**
 * 执行完整的集群配置检测
 * 整合 Doppler Token 检测、Executor 检测和环境特定规则
 */
export async function performClusterConfigCheck(
  clusterName: string,
  clusterDisplayName: string,
  options: {
    checkLevel?: ConfigCheckLevel;
    forceRefresh?: boolean;
  } = {}
): Promise<ClusterConfigCheckResult> {
  const startTime = Date.now();
  const { checkLevel = 'connection', forceRefresh = false } = options;
  const environment = getClusterEnvironment(clusterName);
  const requiredDatabases = getRequiredDatabases(environment);

  // 初始化检测结果
  const result: ClusterConfigCheckResult = {
    clusterName,
    clusterDisplayName,
    checkLevel,
    timestamp: new Date().toISOString(),
    durationMs: 0,
    environment,
    overallStatus: 'success',
    overallMessage: '',
    dopplerToken: {
      clusterTokenStatus: {
        key: 'cluster_doppler_token',
        name: '集群 Doppler Token',
        status: 'skipped',
        message: '',
        required: true,
      },
    },
    executor: {
      urlStatus: {
        key: 'executor_url',
        name: 'Executor URL',
        status: 'skipped',
        message: '',
        required: true,
      },
      signingSecretStatus: {
        key: 'executor_signing_secret',
        name: '签名密钥',
        status: 'skipped',
        message: '',
        required: true,
      },
    },
    databases: [],
    summary: {
      total: 0,
      success: 0,
      warning: 0,
      error: 0,
      skipped: 0,
      requiredTotal: requiredDatabases.length + 2, // Doppler Token + Executor URL
      requiredConfigured: 0,
      missingRequired: [],
    },
  };

  try {
    // 第一步：检查集群 Doppler Token
    const clusterEnvStatus = checkClusterEnvStatus(clusterName);
    if (clusterEnvStatus.configured) {
      result.dopplerToken.clusterTokenStatus = {
        key: 'cluster_doppler_token',
        name: '集群 Doppler Token',
        status: 'success',
        message: `${clusterEnvStatus.envVarName} 已配置`,
        details: clusterEnvStatus.envVarName,
        required: true,
      };
    } else {
      result.dopplerToken.clusterTokenStatus = {
        key: 'cluster_doppler_token',
        name: '集群 Doppler Token',
        status: 'error',
        message: `${clusterEnvStatus.envVarName} 未配置`,
        details: `请在 Console 的 Doppler 配置中添加 ${clusterEnvStatus.envVarName}`,
        required: true,
      };
      result.overallStatus = 'error';
      result.overallMessage = `集群 Doppler Token 未配置`;
      result.summary.missingRequired.push('集群 Doppler Token');
      result.durationMs = Date.now() - startTime;
      updateSummary(result);
      return result;
    }

    // 第二步：检查 Executor 配置
    const executorConfig = await getExecutorConfig(clusterName);
    if (executorConfig.source !== 'fallback') {
      result.executor.urlStatus = {
        key: 'executor_url',
        name: 'Executor URL',
        status: 'success',
        message: '已配置',
        maskedUrl: executorConfig.url.replace(/\/\/[^@]+@/, '//***@'),
        required: true,
      };
      result.executor.maskedUrl = executorConfig.url;

      if (executorConfig.signingSecret) {
        result.executor.signingSecretStatus = {
          key: 'executor_signing_secret',
          name: '签名密钥',
          status: 'success',
          message: '已配置',
          required: true,
        };
      } else {
        result.executor.signingSecretStatus = {
          key: 'executor_signing_secret',
          name: '签名密钥',
          status: 'warning',
          message: '未配置，将使用回退配置',
          required: true,
        };
      }
    } else {
      result.executor.urlStatus = {
        key: 'executor_url',
        name: 'Executor URL',
        status: 'warning',
        message: '使用本地回退配置',
        maskedUrl: executorConfig.url,
        required: true,
      };
      result.executor.signingSecretStatus = {
        key: 'executor_signing_secret',
        name: '签名密钥',
        status: 'warning',
        message: '使用本地回退配置',
        required: true,
      };
    }

    // 第三步：如果需要连接测试，测试 Executor 健康检查
    if (checkLevel === 'connection' || checkLevel === 'full') {
      try {
        const healthResponse = await fetch(`${executorConfig.url}/api/v1/health`, {
          method: 'GET',
          cache: 'no-store',
        });

        if (healthResponse.ok) {
          result.executor.healthStatus = {
            key: 'executor_health',
            name: 'Executor 健康检查',
            status: 'success',
            message: 'Executor 服务正常运行',
            required: false,
          };
        } else {
          result.executor.healthStatus = {
            key: 'executor_health',
            name: 'Executor 健康检查',
            status: 'error',
            message: `Executor 返回 HTTP ${healthResponse.status}`,
            required: false,
          };
        }
      } catch (error) {
        result.executor.healthStatus = {
          key: 'executor_health',
          name: 'Executor 健康检查',
          status: 'error',
          message: error instanceof Error ? error.message : '无法连接 Executor',
          required: false,
        };
      }
    }

    // 第四步：检查数据库配置
    // 首先从 Doppler 获取配置状态
    const targetDbStatus = await getClusterTargetDbStatus(clusterName);

    for (const [key, targetConfig] of Object.entries(DB_TARGET_TYPES)) {
      const targetTypeKey = key as DbTargetTypeKey;
      const isRequired = isDatabaseRequired(targetTypeKey, environment);
      const requiredReason = getDatabaseRequiredReason(targetTypeKey);

      // 获取环境变量配置状态
      const envVarKey = targetConfig.envVar as keyof typeof targetDbStatus.databases;
      const dbUrlStatus = targetDbStatus.databases[envVarKey];
      const configured = dbUrlStatus?.configured || false;

      const dbResult: DatabaseCheckResult = {
        targetTypeKey,
        displayName: targetConfig.displayName,
        envVar: targetConfig.envVar,
        configStatus: {
          key: `db_config_${targetTypeKey}`,
          name: `${targetConfig.displayName} 配置`,
          status: configured ? 'success' : isRequired ? 'error' : 'warning',
          message: configured
            ? '已配置'
            : isRequired
              ? `必须配置（${requiredReason}）`
              : '未配置（可选）',
          maskedUrl: dbUrlStatus?.maskedUrl,
          required: isRequired,
        },
        required: isRequired,
        requiredReason: isRequired ? requiredReason : undefined,
      };

      // 如果配置了且需要连接测试
      if (configured && (checkLevel === 'connection' || checkLevel === 'full')) {
        // 调用 Executor 进行连接测试
        const connectionResult = await testDatabaseConnection(clusterName, targetTypeKey);

        dbResult.connectionStatus = {
          key: `db_connection_${targetTypeKey}`,
          name: `${targetConfig.displayName} 连接测试`,
          status: connectionResult.success ? 'success' : 'error',
          message: connectionResult.message,
          latencyMs: connectionResult.latencyMs,
          required: false,
        };
      }

      result.databases.push(dbResult);

      // 记录缺失的必须配置
      if (!configured && isRequired) {
        result.summary.missingRequired.push(targetConfig.displayName);
      }
    }

    // 更新摘要
    updateSummary(result);

    // 确定整体状态
    if (result.summary.error > 0) {
      result.overallStatus = 'error';
      result.overallMessage = `${result.summary.error} 项配置错误`;
    } else if (result.summary.warning > 0) {
      result.overallStatus = 'warning';
      result.overallMessage = `${result.summary.warning} 项配置警告`;
    } else {
      result.overallStatus = 'success';
      result.overallMessage = '所有配置检测通过';
    }

    if (result.summary.missingRequired.length > 0) {
      result.overallMessage += `，缺失必须配置: ${result.summary.missingRequired.join('、')}`;
    }
  } catch (error) {
    result.overallStatus = 'error';
    result.overallMessage = error instanceof Error ? error.message : '配置检测失败';
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * 更新检测摘要
 */
function updateSummary(result: ClusterConfigCheckResult): void {
  const allItems: CheckItemResult[] = [
    result.dopplerToken.clusterTokenStatus,
    result.executor.urlStatus,
    result.executor.signingSecretStatus,
  ];

  if (result.dopplerToken.targetDbTokenStatus) {
    allItems.push(result.dopplerToken.targetDbTokenStatus);
  }

  if (result.executor.healthStatus) {
    allItems.push(result.executor.healthStatus);
  }

  for (const db of result.databases) {
    allItems.push(db.configStatus);
    if (db.connectionStatus) {
      allItems.push(db.connectionStatus);
    }
  }

  result.summary.total = allItems.length;
  result.summary.success = allItems.filter((i) => i.status === 'success').length;
  result.summary.warning = allItems.filter((i) => i.status === 'warning').length;
  result.summary.error = allItems.filter((i) => i.status === 'error').length;
  result.summary.skipped = allItems.filter((i) => i.status === 'skipped').length;

  // 统计必须项
  const requiredItems = allItems.filter((i) => i.required);
  result.summary.requiredTotal = requiredItems.length;
  result.summary.requiredConfigured = requiredItems.filter(
    (i) => i.status === 'success' || i.status === 'warning'
  ).length;
}
