/**
 * Precheck SQL generator
 * Generates SELECT COUNT(*) precheck statements for UPDATE/DELETE operations
 */

import { Parser } from 'node-sql-parser';

interface PrecheckResult {
  success: boolean;
  precheckSql?: string;
  tableName?: string;
  error?: string;
}

const parser = new Parser();

/**
 * Generate a precheck SQL statement for an UPDATE or DELETE statement
 * The precheck is a SELECT COUNT(*) with the same WHERE clause
 */
export function generatePrecheckSql(writeSql: string): PrecheckResult {
  try {
    const ast = parser.astify(writeSql, { database: 'MySQL' });
    const node = Array.isArray(ast) ? ast[0] : ast;

    if (!node || typeof node !== 'object' || !('type' in node)) {
      return {
        success: false,
        error: 'Unable to parse SQL statement',
      };
    }

    const nodeType = (node.type as string).toLowerCase();

    if (nodeType === 'update') {
      return generateUpdatePrecheck(node as UpdateAst);
    }

    if (nodeType === 'delete') {
      return generateDeletePrecheck(node as DeleteAst);
    }

    return {
      success: false,
      error: `Cannot generate precheck for ${nodeType} statements`,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error';
    return {
      success: false,
      error: `Failed to parse SQL: ${error}`,
    };
  }
}

interface UpdateAst {
  type: string;
  table?: Array<{ db?: string; table: string; as?: string }>;
  where?: unknown;
}

interface DeleteAst {
  type: string;
  from?: Array<{ db?: string; table: string; as?: string }>;
  where?: unknown;
}

/**
 * Generate precheck for UPDATE statement
 */
function generateUpdatePrecheck(ast: UpdateAst): PrecheckResult {
  // Extract table name
  const table = ast.table?.[0];
  if (!table) {
    return {
      success: false,
      error: 'Could not extract table name from UPDATE statement',
    };
  }

  const tableName = formatTableName(table);

  // Check for WHERE clause
  if (!ast.where) {
    return {
      success: false,
      error: 'UPDATE statement has no WHERE clause',
    };
  }

  // Generate WHERE clause SQL
  const whereClause = generateWhereClause(ast.where);
  if (!whereClause) {
    return {
      success: false,
      error: 'Could not generate WHERE clause',
    };
  }

  const precheckSql = `SELECT COUNT(*) AS affected_count FROM ${tableName} WHERE ${whereClause}`;

  return {
    success: true,
    precheckSql,
    tableName: table.table,
  };
}

/**
 * Generate precheck for DELETE statement
 */
function generateDeletePrecheck(ast: DeleteAst): PrecheckResult {
  // Extract table name from FROM clause
  const table = ast.from?.[0];
  if (!table) {
    return {
      success: false,
      error: 'Could not extract table name from DELETE statement',
    };
  }

  const tableName = formatTableName(table);

  // Check for WHERE clause
  if (!ast.where) {
    return {
      success: false,
      error: 'DELETE statement has no WHERE clause',
    };
  }

  // Generate WHERE clause SQL
  const whereClause = generateWhereClause(ast.where);
  if (!whereClause) {
    return {
      success: false,
      error: 'Could not generate WHERE clause',
    };
  }

  const precheckSql = `SELECT COUNT(*) AS affected_count FROM ${tableName} WHERE ${whereClause}`;

  return {
    success: true,
    precheckSql,
    tableName: table.table,
  };
}

/**
 * Format table name with optional database prefix
 */
function formatTableName(table: { db?: string; table: string }): string {
  if (table.db) {
    return `\`${table.db}\`.\`${table.table}\``;
  }
  return `\`${table.table}\``;
}

/**
 * Generate WHERE clause from AST
 * Uses node-sql-parser to convert AST back to SQL by wrapping in a fake SELECT
 */
function generateWhereClause(whereAst: unknown): string | null {
  try {
    // Create a fake SELECT statement with the WHERE clause
    // This is necessary because parser.sqlify doesn't work on WHERE AST alone
    const fakeSelectAst = {
      type: 'select',
      columns: [{ expr: { type: 'number', value: 1 }, as: null }],
      from: [{ db: null, table: 'dummy', as: null }],
      where: whereAst,
      // Required fields to satisfy the AST type
      with: null,
      options: null,
      distinct: null,
      groupby: null,
      having: null,
      orderby: null,
      limit: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullSql = parser.sqlify(fakeSelectAst as any, { database: 'MySQL' });

    // Extract the WHERE clause from the generated SQL
    const whereMatch = fullSql.match(/WHERE\s+(.+)$/i);
    if (whereMatch && whereMatch[1]) {
      return whereMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract table name from SQL statement
 * Returns the main table name for UPDATE/DELETE statements
 */
export function extractTableName(sql: string): string | null {
  try {
    const ast = parser.astify(sql, { database: 'MySQL' });
    const node = Array.isArray(ast) ? ast[0] : ast;

    if (!node || typeof node !== 'object' || !('type' in node)) {
      return null;
    }

    const nodeType = (node.type as string).toLowerCase();

    if (nodeType === 'update') {
      const updateAst = node as UpdateAst;
      return updateAst.table?.[0]?.table ?? null;
    }

    if (nodeType === 'delete') {
      const deleteAst = node as DeleteAst;
      return deleteAst.from?.[0]?.table ?? null;
    }

    if (nodeType === 'select') {
      // For SELECT, get the first table from FROM clause
      const selectAst = node as { from?: Array<{ table: string }> };
      return selectAst.from?.[0]?.table ?? null;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Validate that precheck SQL matches the write SQL table
 */
export function validatePrecheckMatch(precheckSql: string, writeSql: string): boolean {
  const precheckTable = extractTableName(precheckSql);
  const writeTable = extractTableName(writeSql);

  if (!precheckTable || !writeTable) {
    return false;
  }

  // Case-insensitive comparison
  return precheckTable.toLowerCase() === writeTable.toLowerCase();
}
