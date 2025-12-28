/**
 * Main SQL validator
 * Orchestrates all validation checks and returns comprehensive results
 */

import { splitSqlStatements } from './sql-splitter';
import { detectSqlType, type SqlType } from './sql-type-detector';
import { isForbiddenSql } from './forbidden-detector';
import { validateWhereClause } from './where-validator';
import { generatePrecheckSql } from './precheck-generator';

/**
 * Result for a single statement validation
 */
export interface StatementValidation {
  index: number;
  sql: string;
  type: SqlType;
  valid: boolean;
  requiresPrecheck: boolean;
  suggestedPrecheck?: string;
  errors: string[];
  warnings: string[];
}

/**
 * Overall validation result
 */
export interface ValidationResult {
  valid: boolean;
  statements: StatementValidation[];
  errors: string[];
  warnings: string[];
}

/**
 * Validate raw SQL input
 * Splits into statements and validates each one
 */
export function validateSql(rawSql: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const statements: StatementValidation[] = [];

  // Trim input
  const trimmedSql = rawSql.trim();

  if (!trimmedSql) {
    return {
      valid: false,
      statements: [],
      errors: ['SQL input is empty'],
      warnings: [],
    };
  }

  // Step 1: Split into statements
  const splitResult = splitSqlStatements(trimmedSql);

  if (splitResult.errors.length > 0) {
    return {
      valid: false,
      statements: [],
      errors: splitResult.errors,
      warnings: [],
    };
  }

  if (splitResult.statements.length === 0) {
    return {
      valid: false,
      statements: [],
      errors: ['No valid SQL statements found'],
      warnings: [],
    };
  }

  // Step 2: Validate each statement
  let allValid = true;

  for (let i = 0; i < splitResult.statements.length; i++) {
    const sql = splitResult.statements[i];
    const validation = validateStatement(sql, i);
    statements.push(validation);

    if (!validation.valid) {
      allValid = false;
      // Add statement-specific errors to global errors with position
      for (const error of validation.errors) {
        errors.push(`Statement #${i + 1}: ${error}`);
      }
    }

    // Collect warnings
    for (const warning of validation.warnings) {
      warnings.push(`Statement #${i + 1}: ${warning}`);
    }
  }

  return {
    valid: allValid,
    statements,
    errors,
    warnings,
  };
}

/**
 * Validate a single SQL statement
 */
function validateStatement(sql: string, index: number): StatementValidation {
  const warnings: string[] = [];

  // Step 1: Quick pattern check for forbidden SQL
  const forbiddenCheck = isForbiddenSql(sql);
  if (forbiddenCheck.forbidden) {
    return {
      index,
      sql,
      type: 'forbidden',
      valid: false,
      requiresPrecheck: false,
      errors: [forbiddenCheck.reason!],
      warnings: [],
    };
  }

  // Step 2: Detect statement type using AST parser
  const typeResult = detectSqlType(sql);

  if (typeResult.type === 'unknown') {
    return {
      index,
      sql,
      type: 'unknown',
      valid: false,
      requiresPrecheck: false,
      errors: [typeResult.error || 'Unknown statement type'],
      warnings: [],
    };
  }

  if (typeResult.type === 'forbidden') {
    return {
      index,
      sql,
      type: 'forbidden',
      valid: false,
      requiresPrecheck: false,
      errors: [typeResult.error || 'Forbidden statement type'],
      warnings: [],
    };
  }

  // Step 3: For SELECT, no additional validation needed
  if (typeResult.type === 'select') {
    return {
      index,
      sql,
      type: 'select',
      valid: true,
      requiresPrecheck: false,
      errors: [],
      warnings: [],
    };
  }

  // Step 4: For UPDATE/DELETE, validate WHERE clause
  if (typeResult.type === 'update' || typeResult.type === 'delete') {
    const whereResult = validateWhereClause(sql, typeResult.type);

    if (!whereResult.valid) {
      return {
        index,
        sql,
        type: typeResult.type,
        valid: false,
        requiresPrecheck: true,
        errors: [whereResult.error!],
        warnings: [],
      };
    }

    // Generate suggested precheck SQL
    const precheckResult = generatePrecheckSql(sql);
    const suggestedPrecheck = precheckResult.success ? precheckResult.precheckSql : undefined;

    if (!precheckResult.success) {
      warnings.push(`Could not generate precheck SQL: ${precheckResult.error}`);
    }

    return {
      index,
      sql,
      type: typeResult.type,
      valid: true,
      requiresPrecheck: true,
      suggestedPrecheck,
      errors: [],
      warnings,
    };
  }

  // Should not reach here, but handle just in case
  return {
    index,
    sql,
    type: typeResult.type,
    valid: false,
    requiresPrecheck: false,
    errors: [`Unexpected statement type: ${typeResult.type}`],
    warnings: [],
  };
}

/**
 * Quick validation check - returns true if SQL appears valid
 * Useful for fast pre-filtering before full validation
 */
export function quickValidate(sql: string): boolean {
  const result = validateSql(sql);
  return result.valid;
}

/**
 * Check if SQL requires precheck (contains UPDATE or DELETE)
 */
export function requiresPrecheck(sql: string): boolean {
  const result = validateSql(sql);
  return result.statements.some((s) => s.requiresPrecheck);
}

/**
 * Get all suggested precheck SQL statements
 */
export function getSuggestedPrechecks(sql: string): string[] {
  const result = validateSql(sql);
  return result.statements
    .filter((s) => s.suggestedPrecheck)
    .map((s) => s.suggestedPrecheck!);
}
