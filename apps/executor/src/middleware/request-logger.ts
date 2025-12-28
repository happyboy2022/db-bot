import type { Context, MiddlewareHandler } from 'hono';

/**
 * Request logger configuration
 */
export interface RequestLoggerConfig {
  /** Include request headers in logs */
  logHeaders?: boolean;
  /** Include request body in logs (for POST/PUT/PATCH) */
  logRequestBody?: boolean;
  /** Include response body in logs */
  logResponseBody?: boolean;
  /** Include error stack traces */
  logErrorStack?: boolean;
  /** Custom log function */
  logger?: (data: RequestLogData) => void;
  /** Skip logging for certain requests */
  skip?: (c: Context) => boolean;
  /** Additional fields to include in logs */
  additionalFields?: (c: Context) => Record<string, unknown>;
}

/**
 * Log entry data structure
 */
export interface RequestLogData {
  /** Log level */
  level: 'info' | 'warn' | 'error';
  /** Trace ID for request tracking */
  traceId: string;
  /** HTTP method */
  method: string;
  /** Request path */
  path: string;
  /** Query string */
  query?: string;
  /** HTTP status code */
  status: number;
  /** Request duration in milliseconds */
  durationMs: number;
  /** Client IP address */
  clientIp?: string;
  /** User agent */
  userAgent?: string;
  /** Request headers (if enabled) */
  headers?: Record<string, string>;
  /** Request body (if enabled) */
  requestBody?: unknown;
  /** Response body (if enabled) */
  responseBody?: unknown;
  /** Error details (if any) */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  /** Timestamp */
  timestamp: string;
  /** Additional custom fields */
  [key: string]: unknown;
}

/**
 * Sensitive fields that should be redacted from logs
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'auth',
  'credential',
  'private',
  'key',
  'cookie',
  'session',
];

/**
 * Headers that should be redacted
 */
const SENSITIVE_HEADERS = [
  'authorization',
  'x-api-key',
  'x-auth-token',
  'cookie',
  'set-cookie',
  'x-signature',
];

/**
 * Redact sensitive values from an object
 * @param obj - Object to redact
 * @param depth - Current recursion depth (max 5)
 * @returns Redacted object
 */
function redactSensitiveData(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_FIELDS.some(
        (field) => lowerKey.includes(field)
      );

      if (isSensitive && typeof value === 'string') {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSensitiveData(value, depth + 1);
      }
    }

    return redacted;
  }

  return obj;
}

/**
 * Redact sensitive headers
 * @param headers - Headers object
 * @returns Redacted headers
 */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_HEADERS.some((h) => lowerKey.includes(h));

    redacted[key] = isSensitive ? '[REDACTED]' : value;
  }

  return redacted;
}

/**
 * Get client IP from request
 */
function getClientIp(c: Context): string | undefined {
  const forwardedFor = c.req.header('X-Forwarded-For');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  return c.req.header('X-Real-IP');
}

/**
 * Get all request headers as an object
 */
function getHeaders(c: Context): Record<string, string> {
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

/**
 * Determine log level based on status code
 */
function getLogLevel(status: number): 'info' | 'warn' | 'error' {
  if (status >= 500) {
    return 'error';
  }
  if (status >= 400) {
    return 'warn';
  }
  return 'info';
}

/**
 * Default logger function (outputs structured JSON)
 */
function defaultLogger(data: RequestLogData): void {
  const output = JSON.stringify(data);

  switch (data.level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

/**
 * Create a request logging middleware
 *
 * Features:
 * - Structured JSON logging for easy parsing
 * - Automatic sensitive data redaction
 * - Request/response body logging (optional)
 * - Duration tracking
 * - Trace ID propagation
 * - Level-based logging (info/warn/error based on status)
 *
 * @param config - Logger configuration
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * // Basic usage
 * app.use('*', requestLoggerMiddleware());
 *
 * // With custom configuration
 * app.use('*', requestLoggerMiddleware({
 *   logHeaders: true,
 *   logRequestBody: true,
 *   skip: (c) => c.req.path === '/health',
 * }));
 * ```
 */
export function requestLoggerMiddleware(
  config: RequestLoggerConfig = {}
): MiddlewareHandler {
  const {
    logHeaders = false,
    logRequestBody = false,
    logResponseBody = false,
    logErrorStack = true,
    logger = defaultLogger,
    skip,
    additionalFields,
  } = config;

  return async (c, next) => {
    // Check if should skip logging
    if (skip && skip(c)) {
      return next();
    }

    const startTime = Date.now();

    // Get or generate trace ID
    const traceId = c.req.header('X-Trace-ID') || crypto.randomUUID();

    // Set trace ID in response headers
    c.header('X-Trace-ID', traceId);

    // Capture request body if enabled
    let requestBody: unknown;
    if (
      logRequestBody &&
      ['POST', 'PUT', 'PATCH'].includes(c.req.method)
    ) {
      try {
        const clonedRequest = c.req.raw.clone();
        const contentType = c.req.header('Content-Type') || '';

        if (contentType.includes('application/json')) {
          requestBody = await clonedRequest.json();
        } else if (contentType.includes('text/')) {
          requestBody = await clonedRequest.text();
        }
      } catch {
        // Ignore body parsing errors
      }
    }

    let error: Error | undefined;

    try {
      await next();
    } catch (e) {
      error = e instanceof Error ? e : new Error(String(e));
      throw e;
    } finally {
      const durationMs = Date.now() - startTime;
      const status = c.res.status;

      // Build log data
      const logData: RequestLogData = {
        level: getLogLevel(status),
        traceId,
        method: c.req.method,
        path: c.req.path,
        status,
        durationMs,
        timestamp: new Date().toISOString(),
      };

      // Add query string if present
      const url = new URL(c.req.url);
      if (url.search) {
        logData.query = url.search;
      }

      // Add client IP
      const clientIp = getClientIp(c);
      if (clientIp) {
        logData.clientIp = clientIp;
      }

      // Add user agent
      const userAgent = c.req.header('User-Agent');
      if (userAgent) {
        logData.userAgent = userAgent;
      }

      // Add headers if enabled
      if (logHeaders) {
        logData.headers = redactHeaders(getHeaders(c));
      }

      // Add request body if captured
      if (requestBody !== undefined) {
        logData.requestBody = redactSensitiveData(requestBody);
      }

      // Add response body if enabled (only for JSON responses)
      if (logResponseBody) {
        try {
          const contentType = c.res.headers.get('Content-Type') || '';
          if (contentType.includes('application/json')) {
            const clonedResponse = c.res.clone();
            const responseBody = await clonedResponse.json();
            logData.responseBody = redactSensitiveData(responseBody);
          }
        } catch {
          // Ignore response body parsing errors
        }
      }

      // Add error details if present
      if (error) {
        logData.error = {
          name: error.name,
          message: error.message,
        };
        if (logErrorStack && error.stack) {
          logData.error.stack = error.stack;
        }
      }

      // Add additional fields
      if (additionalFields) {
        const additional = additionalFields(c);
        Object.assign(logData, additional);
      }

      // Log the request
      logger(logData);
    }
  };
}

/**
 * Create a minimal logger that only logs errors
 */
export function errorOnlyLogger(): MiddlewareHandler {
  return requestLoggerMiddleware({
    skip: (_c) => {
      // Only log after request is processed
      return false;
    },
    logger: (data) => {
      // Only log errors
      if (data.level === 'error') {
        defaultLogger(data);
      }
    },
  });
}

/**
 * Create a development logger with full details
 */
export function devLogger(): MiddlewareHandler {
  return requestLoggerMiddleware({
    logHeaders: true,
    logRequestBody: true,
    logResponseBody: true,
    logErrorStack: true,
  });
}

/**
 * Create a production logger with minimal details
 */
export function prodLogger(): MiddlewareHandler {
  return requestLoggerMiddleware({
    logHeaders: false,
    logRequestBody: false,
    logResponseBody: false,
    logErrorStack: false,
    skip: (c) => {
      // Skip health checks in production
      return c.req.path === '/health' || c.req.path === '/';
    },
  });
}
