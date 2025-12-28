import type { Context } from 'hono';

/**
 * Error response options
 */
export interface ErrorResponseOptions {
  /** HTTP status code */
  status: number;
  /** Error code for client identification */
  code: string;
  /** User-facing error message (sanitized in production) */
  message: string;
  /** Additional details (only included in development) */
  details?: unknown;
  /** Internal error for logging (never sent to client) */
  internalError?: Error;
}

/**
 * Standard error response format
 */
export interface ErrorResponseBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    traceId?: string;
  };
}

/**
 * Error codes for common scenarios
 */
export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  SIGNATURE_EXPIRED: 'SIGNATURE_EXPIRED',
  NONCE_REUSED: 'NONCE_REUSED',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_PARAMETER: 'MISSING_PARAMETER',

  // Database
  DB_CONNECTION_ERROR: 'DB_CONNECTION_ERROR',
  DB_QUERY_ERROR: 'DB_QUERY_ERROR',
  DB_TIMEOUT: 'DB_TIMEOUT',

  // Execution
  EXECUTION_ERROR: 'EXECUTION_ERROR',
  EXECUTION_TIMEOUT: 'EXECUTION_TIMEOUT',
  EXECUTION_TERMINATED: 'EXECUTION_TERMINATED',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',

  // Internal
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

/**
 * Production-safe error messages
 * Maps error codes to generic messages that don't leak internal details
 */
const PRODUCTION_MESSAGES: Record<string, string> = {
  [ErrorCodes.UNAUTHORIZED]: '认证失败',
  [ErrorCodes.FORBIDDEN]: '权限不足',
  [ErrorCodes.INVALID_SIGNATURE]: '签名无效',
  [ErrorCodes.SIGNATURE_EXPIRED]: '签名已过期',
  [ErrorCodes.NONCE_REUSED]: '请求已处理',
  [ErrorCodes.VALIDATION_ERROR]: '请求参数无效',
  [ErrorCodes.INVALID_REQUEST]: '请求格式错误',
  [ErrorCodes.MISSING_PARAMETER]: '缺少必要参数',
  [ErrorCodes.DB_CONNECTION_ERROR]: '数据库连接失败',
  [ErrorCodes.DB_QUERY_ERROR]: '数据库查询失败',
  [ErrorCodes.DB_TIMEOUT]: '数据库操作超时',
  [ErrorCodes.EXECUTION_ERROR]: '执行失败',
  [ErrorCodes.EXECUTION_TIMEOUT]: '执行超时',
  [ErrorCodes.EXECUTION_TERMINATED]: '执行已终止',
  [ErrorCodes.RATE_LIMIT_EXCEEDED]: '请求过于频繁，请稍后重试',
  [ErrorCodes.INTERNAL_ERROR]: '服务器内部错误',
  [ErrorCodes.SERVICE_UNAVAILABLE]: '服务暂时不可用',
};

/**
 * Check if running in production environment
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Sanitize error message for production
 * @param code - Error code
 * @param message - Original message
 * @returns Sanitized message safe for production
 */
function sanitizeMessage(code: string, message: string): string {
  if (!isProduction()) {
    return message;
  }
  return PRODUCTION_MESSAGES[code] || PRODUCTION_MESSAGES[ErrorCodes.INTERNAL_ERROR];
}

/**
 * Create a standardized error response
 *
 * Features:
 * - Sanitizes error messages in production (hides internal details)
 * - Includes traceId for request tracking
 * - Logs full error details server-side
 * - Returns consistent error format
 *
 * @param c - Hono context
 * @param options - Error response options
 * @returns JSON response with error details
 *
 * @example
 * ```typescript
 * // Simple error
 * return errorResponse(c, {
 *   status: 400,
 *   code: ErrorCodes.VALIDATION_ERROR,
 *   message: 'Invalid SQL syntax',
 * });
 *
 * // Error with internal details
 * return errorResponse(c, {
 *   status: 500,
 *   code: ErrorCodes.DB_CONNECTION_ERROR,
 *   message: 'Failed to connect to database',
 *   internalError: error,
 * });
 * ```
 */
export function errorResponse(
  c: Context,
  options: ErrorResponseOptions
): Response {
  const { status, code, message, details, internalError } = options;

  // Get trace ID from headers or generate one
  const traceId = c.req.header('X-Trace-ID') || crypto.randomUUID();

  // Log full error details server-side
  const logData = {
    traceId,
    code,
    message,
    details,
    path: c.req.path,
    method: c.req.method,
    status,
    error: internalError
      ? {
          name: internalError.name,
          message: internalError.message,
          stack: internalError.stack,
        }
      : undefined,
  };

  if (status >= 500) {
    console.error('[ERROR]', JSON.stringify(logData));
  } else if (status >= 400) {
    console.warn('[WARN]', JSON.stringify(logData));
  }

  // Build response body
  const body: ErrorResponseBody = {
    success: false,
    error: {
      code,
      message: sanitizeMessage(code, message),
      traceId,
    },
  };

  // Include details only in development
  if (!isProduction() && details !== undefined) {
    body.error.details = details;
  }

  return c.json(body, status as 400 | 401 | 403 | 404 | 500);
}

/**
 * Helper for common 400 Bad Request errors
 */
export function badRequest(
  c: Context,
  message: string,
  details?: unknown
): Response {
  return errorResponse(c, {
    status: 400,
    code: ErrorCodes.VALIDATION_ERROR,
    message,
    details,
  });
}

/**
 * Helper for common 401 Unauthorized errors
 */
export function unauthorized(c: Context, message = '认证失败'): Response {
  return errorResponse(c, {
    status: 401,
    code: ErrorCodes.UNAUTHORIZED,
    message,
  });
}

/**
 * Helper for common 403 Forbidden errors
 */
export function forbidden(c: Context, message = '权限不足'): Response {
  return errorResponse(c, {
    status: 403,
    code: ErrorCodes.FORBIDDEN,
    message,
  });
}

/**
 * Helper for common 404 Not Found errors
 */
export function notFound(c: Context, message = '资源不存在'): Response {
  return errorResponse(c, {
    status: 404,
    code: ErrorCodes.INVALID_REQUEST,
    message,
  });
}

/**
 * Helper for common 429 Rate Limit errors
 */
export function rateLimitExceeded(
  c: Context,
  retryAfter?: number
): Response {
  const response = errorResponse(c, {
    status: 429,
    code: ErrorCodes.RATE_LIMIT_EXCEEDED,
    message: '请求过于频繁，请稍后重试',
    details: retryAfter ? { retryAfter } : undefined,
  });

  // Add Retry-After header if provided
  if (retryAfter) {
    response.headers.set('Retry-After', String(Math.ceil(retryAfter / 1000)));
  }

  return response;
}

/**
 * Helper for common 500 Internal Server errors
 */
export function internalError(
  c: Context,
  error: Error,
  message = '服务器内部错误'
): Response {
  return errorResponse(c, {
    status: 500,
    code: ErrorCodes.INTERNAL_ERROR,
    message,
    internalError: error,
  });
}
