import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serve } from '@hono/node-server';
import { signingMiddleware } from './middleware/signing';
import { health } from './routes/health';
import { execute } from './routes/execute';
import { sessions } from './routes/sessions';
import { configCheck } from './routes/config-check';
import { requests } from './routes/requests';
import { initDbConfig, closeAllPools } from './db';
import { closeRedisConnection } from './lib/redis';

/**
 * 检测当前运行时环境
 */
const isBun = typeof process.versions.bun !== 'undefined';
const runtime = isBun ? 'Bun' : 'Node.js';

const app = new Hono();

// Initialize database configuration (fetch from Doppler if needed)
// Using top-level await ensures config is ready before serving requests
try {
  await initDbConfig();
  console.log(`[Executor] Database configuration initialized (${runtime})`);
} catch (err) {
  console.error('[Executor] Failed to initialize database config:', err);
  // Continue anyway - config may be loaded lazily on first use
}

// Global middleware
app.use('*', logger());
app.use('*', cors());

// API v1 路由组
const apiV1 = new Hono();

// Public routes (无需签名验证)
apiV1.route('/health', health);

// Protected routes with HMAC-SHA256 signing verification
// 使用子应用模式确保中间件只执行一次，避免 nonce 重复验证问题
// 重要：不要同时使用 app.use('/path', middleware) 和 app.use('/path/*', middleware)
// 这会导致中间件对同一个请求执行两次
const protectedRoutes = new Hono();
protectedRoutes.use('*', signingMiddleware());
protectedRoutes.route('/execute', execute);
protectedRoutes.route('/sessions', sessions);
protectedRoutes.route('/config', configCheck);
protectedRoutes.route('/requests', requests);

// 挂载受保护路由到 API v1
// 注意：Hono 会按注册顺序匹配路由，所以 health 路由会优先匹配
apiV1.route('/', protectedRoutes);

app.route('/api/v1', apiV1);

// Root route
app.get('/', (c) => {
  return c.json({
    name: 'SQL Ops Executor',
    version: '0.0.1',
    runtime,
  });
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  console.log(`[Executor] Received ${signal}, starting graceful shutdown...`);

  // Close database connection pools
  try {
    await closeAllPools();
    console.log('[Executor] All connection pools closed');
  } catch (err) {
    console.error('[Executor] Error closing connection pools:', err);
  }

  // Close Redis connection
  try {
    await closeRedisConnection();
    console.log('[Executor] Redis connection closed');
  } catch (err) {
    console.error('[Executor] Error closing Redis connection:', err);
  }

  console.log('[Executor] Graceful shutdown complete');
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Server configuration
const port = Number(process.env.PORT) || 8787;

// Start server based on runtime
if (isBun) {
  // Bun uses the export default pattern
  console.log(`[Executor] Starting server on port ${port} (Bun runtime)`);
} else {
  // Node.js uses @hono/node-server
  console.log(`[Executor] Starting server on port ${port} (Node.js runtime)`);
  serve({
    fetch: app.fetch,
    port,
  });
}

// Export for Bun runtime (ignored by Node.js)
export default {
  port,
  fetch: app.fetch,
};
