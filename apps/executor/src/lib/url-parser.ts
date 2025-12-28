/**
 * URL 解析工具
 * 提供 MySQL 和 Redis 连接字符串的统一解析功能
 */

/**
 * 解析后的数据库连接配置
 */
export interface ParsedDbConnection {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

/**
 * 解析后的 Redis 连接配置
 */
export interface ParsedRedisConnection {
  host: string;
  port: number;
  password: string | null;
  database: number;
}

/**
 * 解析 MySQL 连接字符串
 * 支持格式: mysql://user:password@host:port/database
 *          mysql2://user:password@host:port/database
 *
 * @param url MySQL 连接字符串
 * @returns 解析后的连接配置，解析失败返回 null
 */
export function parseMysqlUrl(url: string): ParsedDbConnection | null {
  try {
    // 处理 mysql:// 或 mysql2:// 协议
    const normalizedUrl = url.replace(/^mysql2?:\/\//, 'http://');
    const parsed = new URL(normalizedUrl);

    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 3306,
      database: parsed.pathname.slice(1), // 移除开头的 /
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
    };
  } catch {
    return null;
  }
}

/**
 * 解析 Redis 连接字符串
 * 支持格式: redis://:password@host:port/database
 *
 * @param url Redis 连接字符串
 * @returns 解析后的连接配置，解析失败返回 null
 */
export function parseRedisUrl(url: string): ParsedRedisConnection | null {
  try {
    const normalizedUrl = url.replace(/^redis:\/\//, 'http://');
    const parsed = new URL(normalizedUrl);

    return {
      host: parsed.hostname,
      port: parseInt(parsed.port, 10) || 6379,
      password: parsed.password ? decodeURIComponent(parsed.password) : null,
      database: parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) || 0 : 0,
    };
  } catch {
    return null;
  }
}
