/**
 * Local File Cache for Doppler Secrets
 * 在本地开发环境下持久化 Doppler 配置到本地文件
 *
 * 缓存策略:
 * - 只在本地开发环境 (NODE_ENV !== 'production') 时启用
 * - 成功从 Doppler 获取配置后，保存到本地文件
 * - Doppler 获取失败时，尝试从本地文件读取
 * - 缓存文件存放在 .cache/doppler-secrets.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 缓存的配置数据结构
 */
export interface CachedSecrets {
  /** 配置数据 */
  secrets: Record<string, string>;
  /** 保存时间戳 */
  savedAt: number;
  /** Doppler Token Hash (用于验证是否是同一个 token) */
  tokenHash: string;
}

/**
 * 检查是否为本地开发环境
 */
function isLocalDev(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * 获取缓存目录路径
 */
function getCacheDir(): string {
  // 使用项目根目录下的 .cache 目录
  return path.resolve(process.cwd(), '.cache');
}

/**
 * 获取缓存文件路径
 */
function getCacheFilePath(): string {
  return path.join(getCacheDir(), 'doppler-secrets.json');
}

/**
 * 生成 token 的简单 hash (用于验证缓存是否匹配当前 token)
 */
function hashToken(token: string): string {
  // 简单的 hash: 使用 token 的前8位和后8位的组合
  // 这样不会暴露完整的 token，但可以检测 token 是否变化
  const prefix = token.slice(0, 8);
  const suffix = token.slice(-8);
  return `${prefix}...${suffix}`;
}

/**
 * 保存配置到本地缓存文件
 * 只在本地开发环境时生效
 *
 * @param secrets Doppler 返回的配置
 * @param token 用于获取配置的 Doppler Token
 */
export function saveToLocalCache(
  secrets: Record<string, string>,
  token: string
): void {
  // 非本地开发环境不保存
  if (!isLocalDev()) {
    return;
  }

  try {
    const cacheDir = getCacheDir();
    const cacheFile = getCacheFilePath();

    // 确保缓存目录存在
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
      console.log('[LocalCache] Created cache directory:', cacheDir);
    }

    const cacheData: CachedSecrets = {
      secrets,
      savedAt: Date.now(),
      tokenHash: hashToken(token),
    };

    fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2), 'utf-8');
    console.log('[LocalCache] Saved Doppler secrets to local cache');
  } catch (error) {
    // 保存失败不影响正常流程，仅记录警告
    console.warn('[LocalCache] Failed to save to local cache:', error);
  }
}

/**
 * 从本地缓存文件读取配置
 * 只在本地开发环境时生效
 *
 * @param token 用于验证缓存的 Doppler Token (可选)
 * @returns 缓存的配置，如果不存在或无效则返回 null
 */
export function loadFromLocalCache(
  token?: string
): Record<string, string> | null {
  // 非本地开发环境不读取
  if (!isLocalDev()) {
    return null;
  }

  try {
    const cacheFile = getCacheFilePath();

    // 检查缓存文件是否存在
    if (!fs.existsSync(cacheFile)) {
      console.log('[LocalCache] No local cache file found');
      return null;
    }

    const content = fs.readFileSync(cacheFile, 'utf-8');
    const cacheData: CachedSecrets = JSON.parse(content);

    // 验证缓存数据结构
    if (!cacheData.secrets || typeof cacheData.secrets !== 'object') {
      console.warn('[LocalCache] Invalid cache data structure');
      return null;
    }

    // 如果提供了 token，验证缓存是否匹配
    if (token && cacheData.tokenHash !== hashToken(token)) {
      console.warn(
        '[LocalCache] Cache token mismatch, ignoring cached data'
      );
      return null;
    }

    // 计算缓存年龄
    const ageMs = Date.now() - cacheData.savedAt;
    const ageMinutes = Math.round(ageMs / 60000);
    console.log(
      `[LocalCache] Loaded secrets from local cache (age: ${ageMinutes} minutes)`
    );

    return cacheData.secrets;
  } catch (error) {
    console.warn('[LocalCache] Failed to load from local cache:', error);
    return null;
  }
}

/**
 * 清除本地缓存文件
 */
export function clearLocalCache(): void {
  try {
    const cacheFile = getCacheFilePath();

    if (fs.existsSync(cacheFile)) {
      fs.unlinkSync(cacheFile);
      console.log('[LocalCache] Local cache cleared');
    }
  } catch (error) {
    console.warn('[LocalCache] Failed to clear local cache:', error);
  }
}

/**
 * 获取本地缓存状态信息
 */
export function getLocalCacheStats(): {
  exists: boolean;
  isLocalDev: boolean;
  ageMs: number | null;
  path: string;
} {
  const cacheFile = getCacheFilePath();
  let ageMs: number | null = null;

  if (fs.existsSync(cacheFile)) {
    try {
      const content = fs.readFileSync(cacheFile, 'utf-8');
      const cacheData: CachedSecrets = JSON.parse(content);
      ageMs = Date.now() - cacheData.savedAt;
    } catch {
      // 忽略解析错误
    }
  }

  return {
    exists: fs.existsSync(cacheFile),
    isLocalDev: isLocalDev(),
    ageMs,
    path: cacheFile,
  };
}
