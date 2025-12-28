/**
 * Database target whitelist validator
 * Validates that requested targets are configured and allowed
 */

import type { DbType, DbCode } from '@sql-ops/shared';
import { getTargetConfig, getAllTargets } from './config';

/**
 * Check if a target is valid (exists in configuration)
 */
export function isValidTarget(
  clusterId: string,
  dbType: DbType | string,
  code: DbCode | string
): boolean {
  const config = getTargetConfig(clusterId, dbType, code);
  return config !== null;
}

/**
 * Validate target and return detailed result
 */
export function validateTarget(
  clusterId: string,
  dbType: DbType | string,
  code: DbCode | string
): {
  valid: boolean;
  error?: string;
} {
  // Check if clusterId is provided
  if (!clusterId || typeof clusterId !== 'string') {
    return {
      valid: false,
      error: 'Invalid clusterId: must be a non-empty string',
    };
  }

  // Check if dbType is valid
  const validDbTypes = ['polardb_mysql', 'redis', 'adb'];
  if (!dbType || !validDbTypes.includes(dbType)) {
    return {
      valid: false,
      error: `Invalid dbType: must be one of ${validDbTypes.join(', ')}`,
    };
  }

  // Check if code is provided
  if (!code || typeof code !== 'string') {
    return {
      valid: false,
      error: 'Invalid code: must be a non-empty string',
    };
  }

  // Check if target exists in configuration
  const config = getTargetConfig(clusterId, dbType, code);
  if (!config) {
    return {
      valid: false,
      error: `Unknown target: ${clusterId}/${dbType}/${code}`,
    };
  }

  // Validate that configuration is complete
  if (!config.host || !config.database || !config.user) {
    return {
      valid: false,
      error: `Incomplete configuration for target: ${clusterId}/${dbType}/${code}`,
    };
  }

  return { valid: true };
}

/**
 * Get list of all valid target identifiers
 */
export function getValidTargets(): string[] {
  const targets = getAllTargets();
  return targets.map((t) => `${t.clusterId}/${t.dbType}/${t.code}`);
}

/**
 * Parse a target string into components
 * Format: clusterId/dbType/code or clusterId:dbType:code
 */
export function parseTargetString(target: string): {
  clusterId: string;
  dbType: string;
  code: string;
} | null {
  // Try slash separator first
  let parts = target.split('/');
  if (parts.length !== 3) {
    // Try colon separator
    parts = target.split(':');
  }

  if (parts.length !== 3) {
    return null;
  }

  const [clusterId, dbType, code] = parts;

  if (!clusterId || !dbType || !code) {
    return null;
  }

  return {
    clusterId: clusterId.toLowerCase(),
    dbType: dbType.toLowerCase(),
    code: code.toLowerCase(),
  };
}
