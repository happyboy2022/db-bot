import { Hono } from 'hono';
import { checkDbHealth, getPoolStats } from '../db';

const health = new Hono();

/**
 * Basic health check endpoint
 * GET /api/v1/health
 */
health.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Detailed health check with database connectivity
 * GET /api/v1/health/detailed
 */
health.get('/detailed', async (c) => {
  const dbHealth = await checkDbHealth();

  return c.json({
    status: dbHealth.healthy ? 'ok' : 'degraded',
    timestamp: dbHealth.timestamp,
    database: {
      healthy: dbHealth.healthy,
      targets: dbHealth.targets,
    },
  });
});

/**
 * Pool statistics endpoint
 * GET /api/v1/health/pools
 */
health.get('/pools', (c) => {
  const stats = getPoolStats();

  return c.json({
    timestamp: new Date().toISOString(),
    pools: stats,
  });
});

export { health };
