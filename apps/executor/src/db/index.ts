/**
 * Database module exports
 */

// Configuration
export {
  loadDbConfig,
  getTargetConfig,
  getAllTargets,
  clearConfigCache,
  initDbConfig,
  refreshDopplerConfig,
  type DbTarget,
  type DbConfig,
} from './config';

// Connection pool
export {
  getPool,
  getConnection,
  closeAllPools,
  closePool,
  hasPool,
  getPoolStats,
  type PoolStats,
} from './pool';

// Target validation
export {
  isValidTarget,
  validateTarget,
  getValidTargets,
  parseTargetString,
} from './validator';

// Health checks
export {
  checkDbHealth,
  checkTargetDbHealth,
  quickHealthCheck,
  type DbHealthStatus,
  type HealthCheckResult,
} from './health';
