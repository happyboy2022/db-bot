/**
 * SQL Validators
 * Exports all validation utilities
 */

// Main validator
export {
  validateSql,
  quickValidate,
  requiresPrecheck,
  getSuggestedPrechecks,
  type ValidationResult,
  type StatementValidation,
} from './sql-validator';

// SQL splitter
export { splitSqlStatements } from './sql-splitter';

// Type detector
export { detectSqlType, parseSql, getParser, type SqlType } from './sql-type-detector';

// Forbidden pattern detector
export { isForbiddenSql, quickForbiddenCheck } from './forbidden-detector';

// WHERE clause validator
export { validateWhereClause, hasWhereClause } from './where-validator';

// Precheck generator
export {
  generatePrecheckSql,
  extractTableName,
  validatePrecheckMatch,
} from './precheck-generator';
