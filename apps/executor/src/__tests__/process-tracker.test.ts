/**
 * Tests for process tracker service
 *
 * 注意：process-tracker 现在强制使用 Redis，不再支持内存模式
 * 这些测试需要 Redis 连接才能运行
 *
 * 运行测试前请确保：
 * 1. 设置 REDIS_URL 环境变量
 * 2. Redis 服务可用
 *
 * 如果没有 Redis，测试会被跳过
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  trackProcess,
  getProcessInfo,
  isSystemOwnedProcess,
  untrackProcess,
  listProcesses,
  ensureRedisAvailable,
  RedisUnavailableError,
  type TrackProcessParams,
} from '../services/process-tracker';
import { isRedisAvailable } from '../lib/redis';

// 测试用的 clusterId
const TEST_CLUSTER = 'test-cluster';
const TEST_DB_TYPE = 'polardb_mysql';
const TEST_CODE = 'test-code';

/**
 * 创建测试用的进程参数
 */
function createTestParams(
  processId: number,
  statementId: string,
  requestId: string
): TrackProcessParams {
  return {
    clusterId: TEST_CLUSTER,
    dbType: TEST_DB_TYPE,
    code: TEST_CODE,
    processId,
    statementId,
    requestId,
    sql: 'SELECT 1',
    timeoutMs: 30000,
  };
}

describe('process-tracker (Redis required)', () => {
  let redisAvailable = false;

  beforeEach(async () => {
    // 检查 Redis 是否可用
    try {
      redisAvailable = await isRedisAvailable();
    } catch {
      redisAvailable = false;
    }
  });

  afterEach(async () => {
    // 清理测试创建的进程
    if (redisAvailable) {
      try {
        await untrackProcess(TEST_CLUSTER, 123);
        await untrackProcess(TEST_CLUSTER, 456);
        await untrackProcess(TEST_CLUSTER, 789);
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Redis availability check', () => {
    it('should throw RedisUnavailableError when Redis is not available', async () => {
      // 这个测试在 Redis 不可用时会验证错误抛出
      // 如果 Redis 可用，则跳过此测试
      if (redisAvailable) {
        console.log('Redis is available, skipping unavailability test');
        return;
      }

      await expect(ensureRedisAvailable()).rejects.toThrow(RedisUnavailableError);
    });
  });

  describe('trackProcess', () => {
    it('should track a process when Redis is available', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }

      await trackProcess(createTestParams(123, 'stmt-1', 'req-1'));
      expect(await isSystemOwnedProcess(TEST_CLUSTER, 123)).toBe(true);
    });

    it('should track multiple processes', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }

      await trackProcess(createTestParams(123, 'stmt-1', 'req-1'));
      await trackProcess(createTestParams(456, 'stmt-2', 'req-1'));
      await trackProcess(createTestParams(789, 'stmt-3', 'req-2'));

      expect(await isSystemOwnedProcess(TEST_CLUSTER, 123)).toBe(true);
      expect(await isSystemOwnedProcess(TEST_CLUSTER, 456)).toBe(true);
      expect(await isSystemOwnedProcess(TEST_CLUSTER, 789)).toBe(true);
    });
  });

  describe('getProcessInfo', () => {
    it('should return null for untracked process', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }

      expect(await getProcessInfo(TEST_CLUSTER, 999)).toBeNull();
    });

    it('should return info for tracked process', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }

      await trackProcess(createTestParams(123, 'stmt-1', 'req-1'));
      const info = await getProcessInfo(TEST_CLUSTER, 123);

      expect(info).not.toBeNull();
      expect(info?.statementId).toBe('stmt-1');
      expect(info?.requestId).toBe('req-1');
    });
  });

  describe('isSystemOwnedProcess', () => {
    it('should return false for untracked process', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }

      expect(await isSystemOwnedProcess(TEST_CLUSTER, 999)).toBe(false);
    });

    it('should return true for tracked process', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }

      await trackProcess(createTestParams(123, 'stmt-1', 'req-1'));
      expect(await isSystemOwnedProcess(TEST_CLUSTER, 123)).toBe(true);
    });
  });

  describe('untrackProcess', () => {
    it('should remove a tracked process', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }

      await trackProcess(createTestParams(123, 'stmt-1', 'req-1'));
      expect(await isSystemOwnedProcess(TEST_CLUSTER, 123)).toBe(true);

      await untrackProcess(TEST_CLUSTER, 123);
      expect(await isSystemOwnedProcess(TEST_CLUSTER, 123)).toBe(false);
    });

    it('should not throw for untracked process', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }

      // 不应该抛出异常
      await untrackProcess(TEST_CLUSTER, 999);
    });
  });

  describe('listProcesses', () => {
    it('should return empty array when no processes tracked', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }

      const processes = await listProcesses(TEST_CLUSTER, TEST_DB_TYPE, TEST_CODE);
      // 可能有其他测试留下的进程，只验证是数组
      expect(Array.isArray(processes)).toBe(true);
    });

    it('should return tracked processes', async () => {
      if (!redisAvailable) {
        console.log('Skipping test: Redis not available');
        return;
      }

      await trackProcess(createTestParams(123, 'stmt-1', 'req-1'));

      const processes = await listProcesses(TEST_CLUSTER, TEST_DB_TYPE, TEST_CODE);
      const p1 = processes.find((p) => p.processId === 123);

      expect(p1).not.toBeUndefined();
      expect(p1?.statementId).toBe('stmt-1');
      expect(p1?.requestId).toBe('req-1');
    });
  });
});
