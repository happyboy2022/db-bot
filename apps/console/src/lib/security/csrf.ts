/**
 * CSRF 保护工具
 *
 * 基于 Origin/Referer 头部验证请求来源
 */

/**
 * 验证请求是否来自受信任的来源
 *
 * @param request - Next.js Request 对象
 * @returns 如果来源可信返回 true，否则返回 false
 */
export function validateOrigin(request: Request): boolean {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (!appUrl) {
    // 如果没有配置 APP_URL，在开发环境下允许所有请求
    // 生产环境会在部署时强制要求配置
    if (process.env.NODE_ENV === 'development') {
      return true;
    }
    console.error('[CSRF] NEXT_PUBLIC_APP_URL 未配置，CSRF 保护已禁用');
    return false;
  }

  // 提取受信任的来源列表
  const trustedOrigins = getTrustedOrigins(appUrl);

  // 获取请求的 Origin 或 Referer
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // 至少需要一个头部存在
  if (!origin && !referer) {
    return false;
  }

  // 验证 Origin
  if (origin) {
    if (trustedOrigins.some((trusted) => origin === trusted)) {
      return true;
    }
  }

  // 验证 Referer
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = refererUrl.origin;
      if (trustedOrigins.some((trusted) => refererOrigin === trusted)) {
        return true;
      }
    } catch {
      // Referer 格式不正确
      return false;
    }
  }

  return false;
}

/**
 * 获取受信任的来源列表
 */
function getTrustedOrigins(appUrl: string): string[] {
  const origins = new Set<string>();

  // 添加应用 URL
  try {
    const url = new URL(appUrl);
    origins.add(url.origin);
  } catch {
    console.error('[CSRF] NEXT_PUBLIC_APP_URL 格式不正确:', appUrl);
  }

  // 添加 BETTER_AUTH_TRUSTED_ORIGINS 配置的来源
  const additionalOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',') || [];
  for (const origin of additionalOrigins) {
    const trimmed = origin.trim();
    if (trimmed) {
      origins.add(trimmed);
    }
  }

  return Array.from(origins);
}

/**
 * CSRF 保护中间件
 *
 * 在 API Route 中使用，验证请求来源
 *
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   const csrfError = verifyCsrf(request);
 *   if (csrfError) {
 *     return csrfError;
 *   }
 *   // ... 处理请求
 * }
 * ```
 */
export function verifyCsrf(request: Request): Response | null {
  if (!validateOrigin(request)) {
    return new Response(JSON.stringify({ error: '请求来源验证失败' }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }
  return null;
}
