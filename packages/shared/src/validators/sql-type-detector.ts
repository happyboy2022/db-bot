/**
 * SQL statement type detector
 * Uses node-sql-parser to parse SQL and detect statement type
 */

import { Parser } from 'node-sql-parser';

export type SqlType = 'select' | 'update' | 'delete' | 'forbidden' | 'unknown';

/**
 * Forbidden statement types that should never be allowed
 */
const FORBIDDEN_TYPES = new Set([
  'create',
  'alter',
  'drop',
  'truncate',
  'grant',
  'revoke',
  'call',
  'set',
  'rename',
  'use',
  'show',
  'desc',
  'describe',
  'explain',
]);

/**
 * Create a parser instance
 * Note: Parser is stateless and can be reused
 */
const parser = new Parser();

interface DetectionResult {
  type: SqlType;
  error?: string;
  astType?: string;
}

/**
 * Detect the type of a SQL statement
 */
export function detectSqlType(sql: string): DetectionResult {
  try {
    const ast = parser.astify(sql, { database: 'MySQL' });

    // Handle array of statements (should be single after splitting)
    const node = Array.isArray(ast) ? ast[0] : ast;

    if (!node || typeof node !== 'object' || !('type' in node)) {
      return { type: 'unknown', error: 'Unable to parse SQL statement' };
    }

    const astType = (node.type as string).toLowerCase();

    // Check for forbidden types
    if (FORBIDDEN_TYPES.has(astType)) {
      return {
        type: 'forbidden',
        astType,
        error: getForbiddenReason(astType),
      };
    }

    // Map allowed types
    if (astType === 'select') {
      return { type: 'select', astType };
    }

    if (astType === 'update') {
      return { type: 'update', astType };
    }

    if (astType === 'delete') {
      return { type: 'delete', astType };
    }

    // INSERT is also forbidden for MVP
    if (astType === 'insert') {
      return {
        type: 'forbidden',
        astType,
        error: 'INSERT statements are not allowed in MVP',
      };
    }

    // Any other type is unknown/forbidden
    return {
      type: 'unknown',
      astType,
      error: `Unsupported statement type: ${astType}`,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown parse error';
    return {
      type: 'unknown',
      error: `SQL syntax error: ${error}`,
    };
  }
}

/**
 * Get human-readable reason for forbidden statement type
 */
function getForbiddenReason(astType: string): string {
  switch (astType) {
    case 'create':
    case 'alter':
    case 'drop':
    case 'truncate':
      return `DDL statements (${astType.toUpperCase()}) are not allowed`;
    case 'grant':
    case 'revoke':
      return `Permission statements (${astType.toUpperCase()}) are not allowed`;
    case 'set':
      return 'SET statements are not allowed';
    case 'call':
      return 'Stored procedure calls (CALL) are not allowed';
    case 'use':
      return 'USE statements are not allowed';
    case 'show':
    case 'desc':
    case 'describe':
    case 'explain':
      return `${astType.toUpperCase()} statements are not allowed`;
    default:
      return `${astType.toUpperCase()} statements are not allowed`;
  }
}

/**
 * Parse SQL and return the AST
 * Useful for other validators that need to inspect the AST
 */
export function parseSql(sql: string): { ast: unknown; error?: string } {
  try {
    const ast = parser.astify(sql, { database: 'MySQL' });
    return { ast };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown parse error';
    return { ast: null, error: `SQL syntax error: ${error}` };
  }
}

/**
 * Get the parser instance for advanced usage
 */
export function getParser(): Parser {
  return parser;
}
