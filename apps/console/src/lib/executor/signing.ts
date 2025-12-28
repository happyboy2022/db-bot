/**
 * Executor 请求签名模块
 * 实现 HMAC-SHA256 签名 + 时间戳 + Nonce 防回放攻击
 */

import { createHmac, randomUUID } from 'crypto';

/**
 * 签名请求头
 */
export interface SignedHeaders {
  'X-Trace-ID': string;
  'X-Timestamp': string;
  'X-Nonce': string;
  'X-Signature': string;
}

/**
 * 签名配置
 */
export interface SigningConfig {
  /** 签名密钥 (64位十六进制字符串) */
  secret: string;
  /** 可选的 trace ID，不传则自动生成 */
  traceId?: string;
}

/**
 * 获取签名密钥
 * 优先从 Doppler 配置获取，否则从环境变量获取
 */
export function getSigningSecret(): string {
  const secret = process.env.EXECUTOR_SIGNING_SECRET;
  if (!secret) {
    console.warn('EXECUTOR_SIGNING_SECRET not configured, using empty secret');
    return '';
  }
  return secret;
}

/**
 * 检查签名密钥是否已配置
 */
export function isSigningConfigured(): boolean {
  const secret = process.env.EXECUTOR_SIGNING_SECRET;
  return !!secret && secret.length >= 32;
}

/**
 * 生成 HMAC-SHA256 签名
 *
 * 签名 payload 格式:
 * {METHOD}\n{PATH}\n{TIMESTAMP}\n{NONCE}\n{BODY}
 */
export function generateSignature(
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
 * 生成签名请求头
 *
 * @param method HTTP 方法
 * @param path 请求路径 (如 /api/v1/execute)
 * @param body 请求体 (JSON 字符串)
 * @param config 签名配置
 * @returns 签名请求头
 */
export function createSignedHeaders(
  method: string,
  path: string,
  body: string,
  config: SigningConfig
): SignedHeaders {
  const timestamp = Date.now();
  const nonce = randomUUID();
  const traceId = config.traceId || randomUUID();

  const signature = generateSignature(method, path, timestamp, nonce, body, config.secret);

  return {
    'X-Trace-ID': traceId,
    'X-Timestamp': timestamp.toString(),
    'X-Nonce': nonce,
    'X-Signature': signature,
  };
}

/**
 * 验证签名 (用于调试或测试)
 *
 * @param method HTTP 方法
 * @param path 请求路径
 * @param timestamp 时间戳
 * @param nonce 随机数
 * @param body 请求体
 * @param signature 待验证的签名
 * @param secret 签名密钥
 * @returns 签名是否有效
 */
export function verifySignature(
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  body: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = generateSignature(method, path, timestamp, nonce, body, secret);
  return signature === expectedSignature;
}

/**
 * 检查时间戳是否在有效窗口内
 *
 * @param timestamp 请求时间戳 (毫秒)
 * @param windowMs 有效窗口 (毫秒)，默认 5 分钟
 * @returns 时间戳是否有效
 */
export function isTimestampValid(timestamp: number, windowMs: number = 5 * 60 * 1000): boolean {
  const now = Date.now();
  return Math.abs(now - timestamp) <= windowMs;
}
