/**
 * Executor module exports
 */

// Configuration
export {
  getExecutorConfig,
  clearExecutorConfigCache,
  getCachedClusterIds,
  getCacheStats,
  isUsingFallbackConfig,
  type ExecutorConfig,
} from './config';

// SQL execution
export {
  executeStatement,
  executePrecheck,
  type ExecuteParams,
  type ExecuteResult,
  type PrecheckParams,
  type PrecheckResult,
} from './client';

// Session management
export {
  getSessionTargets,
  getSessions,
  killSession,
  type SessionInfo,
  type SessionTarget,
  type GetSessionsResult,
  type GetTargetsResult,
  type KillSessionResult,
} from './sessions';

// Signing utilities
export {
  createSignedHeaders,
  generateSignature,
  verifySignature,
  isTimestampValid,
  getSigningSecret,
  isSigningConfigured,
  type SignedHeaders,
  type SigningConfig,
} from './signing';

// Config check
export {
  fetchExecutorConfigCheck,
  testDatabaseConnection,
  performClusterConfigCheck,
} from './config-check';

// Request management
export {
  getRequestExecutionStatus,
  terminateRequestExecution,
  preTerminateRequest,
  checkPreTerminateStatus,
  listExecutingRequests,
  type RequestStatus,
  type RequestInfo,
  type ExecutingRequest,
  type PreTerminateInfo,
  type GetRequestStatusResult,
  type TerminateRequestResult,
  type PreTerminateRequestResult,
  type CheckPreTerminateResult,
  type ListExecutingRequestsResult,
} from './requests';
