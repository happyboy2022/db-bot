/**
 * Nonce Tracker for Redis
 * Provides distributed nonce validation for replay attack prevention
 */

import { getRedisClient, isRedisAvailable } from './client';

/**
 * Redis key prefix for nonce entries
 */
const NONCE_KEY_PREFIX = 'executor:nonce';

/**
 * TTL for nonce entries in seconds (10 minutes)
 */
const NONCE_TTL_SECONDS = 10 * 60;

/**
 * Check if a nonce has been used (via Redis)
 * @param nonce - The nonce to check
 * @returns true if nonce was already used, false otherwise
 */
export async function isNonceUsedInRedis(nonce: string): Promise<boolean> {
  const redis = await getRedisClient();
  const key = `${NONCE_KEY_PREFIX}:${nonce}`;
  return (await redis.exists(key)) === 1;
}

/**
 * Mark a nonce as used (via Redis)
 * @param nonce - The nonce to mark as used
 */
export async function markNonceUsedInRedis(nonce: string): Promise<void> {
  const redis = await getRedisClient();
  const key = `${NONCE_KEY_PREFIX}:${nonce}`;
  await redis.setex(key, NONCE_TTL_SECONDS, Date.now().toString());
}

/**
 * Get nonce tracker statistics from Redis
 * Note: This is an approximation based on key scanning
 */
export async function getNonceTrackerStats(): Promise<{
  mode: 'redis';
  approximateCount: number;
  ttlSeconds: number;
}> {
  const redis = await getRedisClient();

  // Use SCAN to count keys (non-blocking)
  let cursor = '0';
  let count = 0;

  do {
    const [nextCursor, keys] = await redis.scan(
      cursor,
      'MATCH',
      `${NONCE_KEY_PREFIX}:*`,
      'COUNT',
      100
    );
    cursor = nextCursor;
    count += keys.length;
  } while (cursor !== '0');

  return {
    mode: 'redis',
    approximateCount: count,
    ttlSeconds: NONCE_TTL_SECONDS,
  };
}

// Re-export isRedisAvailable for convenience
export { isRedisAvailable };
