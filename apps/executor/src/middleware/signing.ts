/**
 * HMAC-SHA256 签名验证中间件
 * 实现请求签名验证、时间戳校验和 nonce 防回放
 *
 * 重要：此模块强制使用 Redis，不支持内存降级
 * 原因：Serverless 环境中内存不可靠，需要跨实例共享 Nonce 状态
 */

import type { Context, Next } from 'hono';
import { createHmac } from 'crypto';
import {
  isRedisAvailable,
  isNonceUsedInRedis,
  markNonceUsedInRedis,
} from '../lib/redis';

/**
 * 签名验证配置
 */
interface SigningConfig {
  /** 签名密钥 */
  secret: string;
  /** 时间戳有效窗口（毫秒），默认 5 分钟 */
  timestampWindow?: number;
  /** 是否跳过签名验证（仅用于开发环境） */
  skipValidation?: boolean;
}

/**
 * 生成签名
 */
function generateSignature(
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  body: string,
  secret: string
): string {
  const payload = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}`;
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * 从 URL 中提取路径（不含查询参数，但用于签名时包含）
 */
function getRequestPath(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname + urlObj.search;
  } catch {
    return url;
  }
}

/**
 * 签名验证中间件
 *
 * 验证流程：
 * 1. 检查必需的请求头（X-Timestamp, X-Nonce, X-Signature）
 * 2. 验证时间戳在有效窗口内
 * 3. 验证 nonce 未被使用过（必须使用 Redis）
 * 4. 验证签名
 * 5. 记录 trace_id
 *
 * 重要：当 Redis 不可用时，中间件将拒绝请求（返回 503）
 */
export function signingMiddleware(config?: Partial<SigningConfig>) {
  const secret = config?.secret || process.env.EXECUTOR_SIGNING_SECRET || '';
  const timestampWindow = config?.timestampWindow || 5 * 60 * 1000; // 5 分钟
  const skipValidation = config?.skipValidation || process.env.SKIP_SIGNATURE_VALIDATION === 'true';

  return async (c: Context, next: Next) => {
    const traceId = c.req.header('X-Trace-ID') || crypto.randomUUID();

    // 设置 trace ID 到 context 和响应头
    c.set('traceId', traceId);
    c.header('X-Trace-ID', traceId);

    // 开发模式跳过验证
    if (skipValidation) {
      console.warn(`[${traceId}] Signature validation skipped (development mode)`);
      await next();
      return;
    }

    // 检查签名密钥是否配置
    if (!secret) {
      console.error(`[${traceId}] EXECUTOR_SIGNING_SECRET not configured`);
      return c.json(
        {
          error: 'Server configuration error',
          message: 'Signing secret not configured',
          traceId,
        },
        500
      );
    }

    // 检查 Redis 是否可用（必需）
    try {
      const redisAvailable = await isRedisAvailable();
      if (!redisAvailable) {
        console.error(`[${traceId}] Redis not available, rejecting request`);
        return c.json(
          {
            error: 'Service Unavailable',
            message: 'Redis 连接失败，无法验证请求（Nonce 验证需要 Redis）',
            traceId,
          },
          503
        );
      }
    } catch (error) {
      console.error(`[${traceId}] Redis check failed:`, error);
      return c.json(
        {
          error: 'Service Unavailable',
          message: 'Redis 连接失败，无法验证请求',
          traceId,
        },
        503
      );
    }

    // 获取请求头
    const timestampStr = c.req.header('X-Timestamp');
    const nonce = c.req.header('X-Nonce');
    const signature = c.req.header('X-Signature');

    // 检查必需的请求头
    if (!timestampStr || !nonce || !signature) {
      console.warn(`[${traceId}] Missing required headers`, {
        hasTimestamp: !!timestampStr,
        hasNonce: !!nonce,
        hasSignature: !!signature,
      });
      return c.json(
        {
          error: 'Missing required headers',
          message: 'X-Timestamp, X-Nonce, and X-Signature headers are required',
          traceId,
        },
        401
      );
    }

    // 解析时间戳
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      console.warn(`[${traceId}] Invalid timestamp format: ${timestampStr}`);
      return c.json(
        {
          error: 'Invalid timestamp',
          message: 'X-Timestamp must be a valid Unix timestamp in milliseconds',
          traceId,
        },
        401
      );
    }

    // 验证时间戳
    const now = Date.now();
    if (Math.abs(now - timestamp) > timestampWindow) {
      console.warn(`[${traceId}] Timestamp out of valid window`, {
        timestamp,
        now,
        diff: Math.abs(now - timestamp),
        window: timestampWindow,
      });
      return c.json(
        {
          error: 'Timestamp expired',
          message: `Request timestamp is outside the valid window (±${timestampWindow / 1000}s)`,
          traceId,
        },
        401
      );
    }

    // 验证 nonce（防回放）- 必须使用 Redis
    try {
      if (await isNonceUsedInRedis(nonce)) {
        console.warn(`[${traceId}] Nonce already used: ${nonce}`);
        return c.json(
          {
            error: 'Nonce already used',
            message: 'This nonce has already been used. Possible replay attack.',
            traceId,
          },
          401
        );
      }
    } catch (error) {
      console.error(`[${traceId}] Redis nonce check failed:`, error);
      return c.json(
        {
          error: 'Service Unavailable',
          message: 'Redis 连接失败，无法验证 Nonce',
          traceId,
        },
        503
      );
    }

    // 获取请求体
    // 注意：一旦调用 c.req.text() 读取请求体，底层流将被消费且无法重读
    // 我们需要缓存请求体供后续中间件（如 zValidator）使用
    let body = '';
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
      body = await c.req.text();
      // 将请求体缓存到 context 中，供后续中间件访问
      c.set('cachedRequestBody', body);
    }

    // 生成期望的签名
    const path = getRequestPath(c.req.url);
    const expectedSignature = generateSignature(c.req.method, path, timestamp, nonce, body, secret);

    // 验证签名
    if (signature !== expectedSignature) {
      console.warn(`[${traceId}] Signature mismatch`, {
        method: c.req.method,
        path,
        timestamp,
        nonce,
        bodyLength: body.length,
      });
      return c.json(
        {
          error: 'Invalid signature',
          message: 'Request signature verification failed',
          traceId,
        },
        401
      );
    }

    // 标记 nonce 为已使用（必须使用 Redis）
    try {
      await markNonceUsedInRedis(nonce);
    } catch (error) {
      console.error(`[${traceId}] Redis nonce mark failed:`, error);
      return c.json(
        {
          error: 'Service Unavailable',
          message: 'Redis 连接失败，无法记录 Nonce',
          traceId,
        },
        503
      );
    }

    // 记录成功的请求
    console.info(`[${traceId}] Request verified`, {
      method: c.req.method,
      path,
      nonce: nonce.substring(0, 8) + '...',
    });

    await next();
  };
}

/**
 * 获取当前 nonce 缓存模式（始终返回 'redis'）
 */
export function getNonceMode(): 'redis' {
  return 'redis';
}

/**
 * 获取当前 nonce 缓存状态（用于监控）
 */
export function getNonceCacheStats(): {
  mode: 'redis';
} {
  return {
    mode: 'redis',
  };
}
