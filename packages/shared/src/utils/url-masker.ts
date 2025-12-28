/**
 * URL 脱敏工具函数
 * 用于安全地显示数据库连接 URL，隐藏敏感信息
 */

/**
 * 脱敏规则：
 * - 密码: 完全隐藏，显示为 ****
 * - 域名: 保留首尾，中间用 *** 替代
 * - 端口: 显示为 ***
 * - 用户名: 保留原样
 * - 数据库名: 保留原样
 */

/**
 * 脱敏域名
 * polardb-cn-xxx.mysql.rds.aliyuncs.com → polardb-***.aliyuncs.com
 */
function maskHostname(hostname: string): string {
  if (!hostname) return hostname;

  const parts = hostname.split('.');
  if (parts.length <= 2) {
    // 简单域名，如 localhost 或 example.com
    return hostname.length > 6 ? `${hostname.slice(0, 3)}***${hostname.slice(-3)}` : hostname;
  }

  // 保留第一部分的前缀和最后两部分（如 aliyuncs.com）
  const firstPart = parts[0];
  const lastTwo = parts.slice(-2).join('.');

  // 对第一部分进行脱敏
  let maskedFirst: string;
  if (firstPart.length <= 6) {
    maskedFirst = firstPart;
  } else {
    // 保留前缀（如 polardb-）
    const dashIndex = firstPart.indexOf('-');
    if (dashIndex > 0 && dashIndex < firstPart.length - 3) {
      maskedFirst = `${firstPart.slice(0, dashIndex + 1)}***`;
    } else {
      maskedFirst = `${firstPart.slice(0, 4)}***`;
    }
  }

  return `${maskedFirst}.${lastTwo}`;
}

/**
 * 脱敏 MySQL/PolarDB URL
 *
 * 示例：
 * - 原始: mysql://admin:secret123@polardb-cn-xxx.mysql.rds.aliyuncs.com:3306/production
 * - 脱敏: mysql://admin:****@polardb-***.aliyuncs.com:＊＊＊/production
 */
export function maskMysqlUrl(url: string): string {
  if (!url) return url;

  try {
    // 处理 mysql:// 和 mysql2:// 协议
    const urlObj = new URL(url.replace(/^mysql2?:\/\//, 'http://'));

    const protocol = url.startsWith('mysql2://') ? 'mysql2' : 'mysql';
    const username = urlObj.username || '';
    const maskedPassword = urlObj.password ? '****' : '';
    const maskedHost = maskHostname(urlObj.hostname);
    const maskedPort = urlObj.port ? '***' : '';
    const database = urlObj.pathname.slice(1); // 去掉开头的 /

    // 重新组装 URL
    let maskedUrl = `${protocol}://`;
    if (username) {
      maskedUrl += maskedPassword ? `${username}:${maskedPassword}@` : `${username}@`;
    }
    maskedUrl += maskedHost;
    if (maskedPort) {
      maskedUrl += `:${maskedPort}`;
    }
    if (database) {
      maskedUrl += `/${database}`;
    }

    return maskedUrl;
  } catch {
    // 如果解析失败，返回完全脱敏的字符串
    return '****://****:****@***:***/****';
  }
}

/**
 * 脱敏 Redis URL
 *
 * 示例：
 * - 原始: redis://:password@host.example.com:6379/0
 * - 脱敏: redis://:****@star.example.com:star/0
 *
 * - 原始: redis://user:password@host.example.com:6379
 * - 脱敏: redis://user:****@star.example.com:star
 */
export function maskRedisUrl(url: string): string {
  if (!url) return url;

  try {
    const urlObj = new URL(url.replace(/^redis:\/\//, 'http://'));

    const username = urlObj.username || '';
    const maskedPassword = urlObj.password ? '****' : '';
    const maskedHost = maskHostname(urlObj.hostname);
    const maskedPort = urlObj.port ? '***' : '';
    const database = urlObj.pathname.slice(1); // 去掉开头的 /

    // 重新组装 URL
    let maskedUrl = 'redis://';
    if (username || maskedPassword) {
      maskedUrl += maskedPassword ? `${username}:${maskedPassword}@` : `${username}@`;
    }
    maskedUrl += maskedHost;
    if (maskedPort) {
      maskedUrl += `:${maskedPort}`;
    }
    if (database) {
      maskedUrl += `/${database}`;
    }

    return maskedUrl;
  } catch {
    // 如果解析失败，返回完全脱敏的字符串
    return 'redis://****:****@***:***/****';
  }
}

/**
 * 根据 URL 协议自动选择脱敏方法
 */
export function maskDatabaseUrl(url: string): string {
  if (!url) return url;

  if (url.startsWith('redis://')) {
    return maskRedisUrl(url);
  }

  if (url.startsWith('mysql://') || url.startsWith('mysql2://')) {
    return maskMysqlUrl(url);
  }

  // 对于未知协议，尝试通用脱敏
  try {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol.replace(':', '');
    const username = urlObj.username || '';
    const maskedPassword = urlObj.password ? '****' : '';
    const maskedHost = maskHostname(urlObj.hostname);
    const maskedPort = urlObj.port ? '***' : '';
    const path = urlObj.pathname;

    let maskedUrl = `${protocol}://`;
    if (username || maskedPassword) {
      maskedUrl += maskedPassword ? `${username}:${maskedPassword}@` : `${username}@`;
    }
    maskedUrl += maskedHost;
    if (maskedPort) {
      maskedUrl += `:${maskedPort}`;
    }
    maskedUrl += path;

    return maskedUrl;
  } catch {
    return '****://****:****@***:***/****';
  }
}

/**
 * 提取 URL 中的关键信息（不含敏感数据）
 */
export interface UrlInfo {
  /** 协议 */
  protocol: string;
  /** 用户名 */
  username: string;
  /** 脱敏后的主机名 */
  maskedHost: string;
  /** 数据库名/路径 */
  database: string;
  /** 是否有密码 */
  hasPassword: boolean;
  /** 是否有端口 */
  hasPort: boolean;
}

/**
 * 解析 URL 并提取非敏感信息
 */
export function parseUrlInfo(url: string): UrlInfo | null {
  if (!url) return null;

  try {
    // 统一处理不同协议
    const normalizedUrl = url
      .replace(/^mysql2?:\/\//, 'http://')
      .replace(/^redis:\/\//, 'http://');

    const urlObj = new URL(normalizedUrl);

    // 提取原始协议
    let protocol = 'unknown';
    if (url.startsWith('mysql2://')) {
      protocol = 'mysql2';
    } else if (url.startsWith('mysql://')) {
      protocol = 'mysql';
    } else if (url.startsWith('redis://')) {
      protocol = 'redis';
    } else {
      const match = url.match(/^(\w+):\/\//);
      if (match) {
        protocol = match[1];
      }
    }

    return {
      protocol,
      username: urlObj.username || '',
      maskedHost: maskHostname(urlObj.hostname),
      database: urlObj.pathname.slice(1) || '',
      hasPassword: !!urlObj.password,
      hasPort: !!urlObj.port,
    };
  } catch {
    return null;
  }
}
