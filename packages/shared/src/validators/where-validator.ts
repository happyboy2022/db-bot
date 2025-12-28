/**
 * WHERE clause validator
 * Validates that UPDATE/DELETE statements have proper WHERE clauses
 * and detects dangerous patterns like WHERE 1=1
 */

import { Parser } from 'node-sql-parser';

interface WhereValidationResult {
  valid: boolean;
  hasWhere: boolean;
  isDangerous: boolean;
  error?: string;
}

/**
 * Patterns that indicate a dangerous/tautological WHERE clause
 */
const DANGEROUS_WHERE_PATTERNS: Array<{ pattern: RegExp; description: string }> = [
  // WHERE 1=1, WHERE 1 = 1, WHERE 1= 1, etc.
  { pattern: /WHERE\s+1\s*=\s*1/i, description: 'WHERE 1=1' },
  // WHERE 0=0
  { pattern: /WHERE\s+0\s*=\s*0/i, description: 'WHERE 0=0' },
  // WHERE true
  { pattern: /WHERE\s+true/i, description: 'WHERE true' },
  // WHERE 'a'='a', WHERE "a"="a"
  { pattern: /WHERE\s+['"](.)['"]\s*=\s*['"]\1['"]/i, description: "WHERE 'a'='a'" },
  // WHERE 1 (truthy value)
  { pattern: /WHERE\s+1\s*(?:;|$)/i, description: 'WHERE 1' },
  // WHERE NOT false
  { pattern: /WHERE\s+NOT\s+false/i, description: 'WHERE NOT false' },
  // WHERE NOT 0
  { pattern: /WHERE\s+NOT\s+0\s*(?:;|$)/i, description: 'WHERE NOT 0' },
];

const parser = new Parser();

/**
 * Validate WHERE clause for UPDATE/DELETE statements
 */
export function validateWhereClause(
  sql: string,
  statementType: 'update' | 'delete'
): WhereValidationResult {
  // First, check for dangerous patterns using regex
  for (const { pattern, description } of DANGEROUS_WHERE_PATTERNS) {
    if (pattern.test(sql)) {
      return {
        valid: false,
        hasWhere: true,
        isDangerous: true,
        error: `Dangerous WHERE clause detected: ${description} is not allowed`,
      };
    }
  }

  // Parse the SQL to check for WHERE clause
  try {
    const ast = parser.astify(sql, { database: 'MySQL' });
    const node = Array.isArray(ast) ? ast[0] : ast;

    if (!node || typeof node !== 'object') {
      return {
        valid: false,
        hasWhere: false,
        isDangerous: false,
        error: 'Unable to parse SQL statement',
      };
    }

    // Check for WHERE clause in the AST
    const hasWhere = 'where' in node && node.where !== null;

    if (!hasWhere) {
      const typeUpper = statementType.toUpperCase();
      return {
        valid: false,
        hasWhere: false,
        isDangerous: false,
        error: `${typeUpper} statement must include a WHERE clause`,
      };
    }

    // Additional check: verify WHERE clause is not just a literal true value
    const whereClause = (node as { where?: unknown }).where;
    if (isDangerousWhereAst(whereClause)) {
      return {
        valid: false,
        hasWhere: true,
        isDangerous: true,
        error: 'WHERE clause contains a tautological condition (always true)',
      };
    }

    return {
      valid: true,
      hasWhere: true,
      isDangerous: false,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return {
      valid: false,
      hasWhere: false,
      isDangerous: false,
      error: `Failed to parse SQL: ${error}`,
    };
  }
}

/**
 * Check if a WHERE AST node represents a dangerous/tautological condition
 */
function isDangerousWhereAst(whereAst: unknown): boolean {
  if (!whereAst || typeof whereAst !== 'object') {
    return false;
  }

  const where = whereAst as Record<string, unknown>;

  // Check for simple binary expressions like 1=1
  if (where.type === 'binary_expr' && where.operator === '=') {
    const left = where.left as Record<string, unknown> | undefined;
    const right = where.right as Record<string, unknown> | undefined;

    if (!left || !right) return false;

    // Check for number = same number (1=1, 0=0, etc.)
    if (left.type === 'number' && right.type === 'number') {
      if (left.value === right.value) {
        return true;
      }
    }

    // Check for string = same string ('a'='a', etc.)
    if (
      (left.type === 'single_quote_string' || left.type === 'string') &&
      (right.type === 'single_quote_string' || right.type === 'string')
    ) {
      if (left.value === right.value) {
        return true;
      }
    }
  }

  // Check for boolean literal true
  if (where.type === 'bool' && where.value === true) {
    return true;
  }

  return false;
}

/**
 * Quick regex check if SQL has a WHERE clause
 * Useful for fast pre-filtering
 */
export function hasWhereClause(sql: string): boolean {
  return /\bWHERE\b/i.test(sql);
}
