import type { Context, MiddlewareHandler } from 'hono';
import { rateLimitExceeded } from '../lib/error-response';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Key generator function (defaults to IP-based) */
  keyGenerator?: (c: Context) => string;
  /** Skip rate limiting for certain requests */
  skip?: (c: Context) => boolean;
  /** Custom handler for rate limit exceeded */
  handler?: (c: Context, retryAfter: number) => Response;
}

/**
 * Rate limit entry for tracking requests
 */
interface RateLimitEntry {
  /** Request timestamps within the current window */
  timestamps: number[];
  /** Window start time */
  windowStart: number;
}

/**
 * In-memory rate limit store
 * Note: This is suitable for single-instance deployments.
 * For multi-instance deployments, consider using Redis.
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Cleanup interval for expired entries (5 minutes)
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Last cleanup timestamp
 */
let lastCleanup = Date.now();

/**
 * Clean up expired rate limit entries
 * @param windowMs - Current window size for determining expiration
 */
function cleanupExpiredEntries(windowMs: number): void {
  const now = Date.now();

  // Only cleanup every CLEANUP_INTERVAL_MS
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanup = now;
  const expirationThreshold = now - windowMs * 2;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.windowStart < expirationThreshold) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Get rate limit entry for a key, creating if necessary
 * @param key - Rate limit key
 * @param windowMs - Window size in milliseconds
 * @returns Rate limit entry
 */
function getOrCreateEntry(key: string, windowMs: number): RateLimitEntry {
  const now = Date.now();
  let entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart >= windowMs) {
    // Create new window
    entry = {
      timestamps: [],
      windowStart: now,
    };
    rateLimitStore.set(key, entry);
  }

  // Filter out timestamps outside the sliding window
  entry.timestamps = entry.timestamps.filter((ts) => now - ts < windowMs);

  return entry;
}

/**
 * Default key generator using IP address
 */
function defaultKeyGenerator(c: Context): string {
  // Try various headers for the real IP
  const forwardedFor = c.req.header('X-Forwarded-For');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = c.req.header('X-Real-IP');
  if (realIp) {
    return realIp;
  }

  // Fallback to a default key (for local development)
  return 'unknown-ip';
}

/**
 * Create a rate limiting middleware using sliding window algorithm
 *
 * Features:
 * - Sliding window rate limiting for accurate request counting
 * - Configurable window size and request limits
 * - Custom key generation for different rate limit scopes
 * - Skip function for bypassing rate limits
 * - Standard rate limit headers (X-RateLimit-*)
 * - Automatic cleanup of expired entries
 *
 * @param config - Rate limit configuration
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * // Basic usage
 * app.use('/api/*', rateLimitMiddleware({
 *   maxRequests: 100,
 *   windowMs: 60000, // 1 minute
 * }));
 *
 * // Per-user rate limiting
 * app.use('/api/*', rateLimitMiddleware({
 *   maxRequests: 50,
 *   windowMs: 60000,
 *   keyGenerator: (c) => c.req.header('X-User-ID') || 'anonymous',
 * }));
 * ```
 */
export function rateLimitMiddleware(config: RateLimitConfig): MiddlewareHandler {
  const {
    maxRequests,
    windowMs,
    keyGenerator = defaultKeyGenerator,
    skip,
    handler,
  } = config;

  return async (c, next) => {
    // Check if should skip rate limiting
    if (skip && skip(c)) {
      return next();
    }

    // Cleanup expired entries periodically
    cleanupExpiredEntries(windowMs);

    // Generate rate limit key
    const key = keyGenerator(c);
    const now = Date.now();

    // Get or create rate limit entry
    const entry = getOrCreateEntry(key, windowMs);

    // Check if rate limit exceeded
    if (entry.timestamps.length >= maxRequests) {
      const oldestTimestamp = entry.timestamps[0];
      const retryAfter = windowMs - (now - oldestTimestamp);

      // Set rate limit headers
      c.header('X-RateLimit-Limit', String(maxRequests));
      c.header('X-RateLimit-Remaining', '0');
      c.header('X-RateLimit-Reset', String(Math.ceil((now + retryAfter) / 1000)));
      c.header('Retry-After', String(Math.ceil(retryAfter / 1000)));

      // Use custom handler or default response
      if (handler) {
        return handler(c, retryAfter);
      }

      return rateLimitExceeded(c, retryAfter);
    }

    // Record this request
    entry.timestamps.push(now);

    // Set rate limit headers
    c.header('X-RateLimit-Limit', String(maxRequests));
    c.header('X-RateLimit-Remaining', String(maxRequests - entry.timestamps.length));
    c.header('X-RateLimit-Reset', String(Math.ceil((entry.windowStart + windowMs) / 1000)));

    return next();
  };
}

/**
 * Preset rate limit configurations for common use cases
 */
export const rateLimitPresets = {
  /**
   * SQL execution endpoints - stricter limits
   * 10 requests per minute
   */
  execute: {
    maxRequests: 10,
    windowMs: 60 * 1000,
  },

  /**
   * Session management endpoints - moderate limits
   * 30 requests per minute
   */
  sessions: {
    maxRequests: 30,
    windowMs: 60 * 1000,
  },

  /**
   * Health check and info endpoints - relaxed limits
   * 60 requests per minute
   */
  health: {
    maxRequests: 60,
    windowMs: 60 * 1000,
  },

  /**
   * General API endpoints - balanced limits
   * 100 requests per minute
   */
  general: {
    maxRequests: 100,
    windowMs: 60 * 1000,
  },
} as const;

/**
 * Create a route-specific rate limiter
 * @param preset - Preset name or custom config
 * @returns Rate limit middleware
 */
export function createRateLimiter(
  preset: keyof typeof rateLimitPresets | RateLimitConfig
): MiddlewareHandler {
  const config = typeof preset === 'string' ? rateLimitPresets[preset] : preset;
  return rateLimitMiddleware(config);
}

/**
 * Clear the rate limit store (useful for testing)
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * Get rate limit store size (useful for monitoring)
 */
export function getRateLimitStoreSize(): number {
  return rateLimitStore.size;
}
