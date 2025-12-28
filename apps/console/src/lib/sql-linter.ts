/**
 * SQL Linter for CodeMirror
 * Integrates with the shared SQL validator to provide inline error highlighting
 */

import type { Diagnostic } from '@codemirror/lint';
import { validateSql } from '@sql-ops/shared';

/**
 * Statement with position information
 */
interface StatementWithPosition {
  sql: string;
  start: number;
  end: number;
}

/**
 * Split SQL statements while tracking their positions in the original text
 */
function splitSqlStatementsWithPositions(sql: string): StatementWithPosition[] {
  const statements: StatementWithPosition[] = [];

  let currentStart = 0;
  let current = '';
  let i = 0;
  const len = sql.length;

  // Skip leading whitespace and track starting position
  while (i < len && /\s/.test(sql[i])) {
    i++;
    currentStart = i;
  }

  while (i < len) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    // Handle line comments (--)
    if (char === '-' && nextChar === '-') {
      // Add comment to current statement
      let commentEnd = sql.indexOf('\n', i);
      if (commentEnd === -1) {
        commentEnd = len;
      }
      current += sql.slice(i, commentEnd);
      i = commentEnd;
      continue;
    }

    // Handle block comments (/* */)
    if (char === '/' && nextChar === '*') {
      const commentEnd = sql.indexOf('*/', i + 2);
      if (commentEnd === -1) {
        // Unclosed comment - include rest of SQL
        current += sql.slice(i);
        i = len;
        continue;
      }
      current += sql.slice(i, commentEnd + 2);
      i = commentEnd + 2;
      continue;
    }

    // Handle single-quoted strings
    if (char === "'") {
      current += char;
      i++;
      while (i < len) {
        const c = sql[i];
        current += c;
        if (c === "'" && sql[i + 1] === "'") {
          current += sql[i + 1];
          i += 2;
        } else if (c === '\\' && sql[i + 1] === "'") {
          current += sql[i + 1];
          i += 2;
        } else if (c === "'") {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Handle double-quoted strings
    if (char === '"') {
      current += char;
      i++;
      while (i < len) {
        const c = sql[i];
        current += c;
        if (c === '"' && sql[i + 1] === '"') {
          current += sql[i + 1];
          i += 2;
        } else if (c === '\\' && sql[i + 1] === '"') {
          current += sql[i + 1];
          i += 2;
        } else if (c === '"') {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Handle backtick-quoted identifiers
    if (char === '`') {
      current += char;
      i++;
      while (i < len) {
        const c = sql[i];
        current += c;
        if (c === '`' && sql[i + 1] === '`') {
          current += sql[i + 1];
          i += 2;
        } else if (c === '`') {
          i++;
          break;
        } else {
          i++;
        }
      }
      continue;
    }

    // Handle semicolon (statement separator)
    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push({
          sql: trimmed,
          start: currentStart,
          end: i, // End at semicolon
        });
      }
      current = '';
      i++;
      // Skip whitespace after semicolon
      while (i < len && /\s/.test(sql[i])) {
        i++;
      }
      currentStart = i;
      continue;
    }

    // Regular character
    current += char;
    i++;
  }

  // Add the last statement if not empty
  const trimmed = current.trim();
  if (trimmed) {
    statements.push({
      sql: trimmed,
      start: currentStart,
      end: len,
    });
  }

  return statements;
}

/**
 * Create SQL diagnostics for CodeMirror linter
 */
export function sqlLint(sql: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!sql.trim()) {
    return diagnostics;
  }

  // Get statements with positions
  const statements = splitSqlStatementsWithPositions(sql);

  // Validate the entire SQL
  const result = validateSql(sql);

  // If there are global errors (e.g., from splitter), report them at the beginning
  if (result.errors.length > 0 && result.statements.length === 0) {
    // Global error - mark entire content
    diagnostics.push({
      from: 0,
      to: sql.length,
      severity: 'error',
      message: result.errors.join('\n'),
    });
    return diagnostics;
  }

  // Map validation errors to their statement positions
  for (const stmt of result.statements) {
    if (!stmt.valid && stmt.errors.length > 0) {
      const position = statements[stmt.index];
      if (position) {
        diagnostics.push({
          from: position.start,
          to: position.end,
          severity: 'error',
          message: stmt.errors.join('\n'),
          source: `语句 #${stmt.index + 1}`,
        });
      }
    }

    // Add warnings as well
    if (stmt.warnings.length > 0) {
      const position = statements[stmt.index];
      if (position) {
        diagnostics.push({
          from: position.start,
          to: position.end,
          severity: 'warning',
          message: stmt.warnings.join('\n'),
          source: `语句 #${stmt.index + 1}`,
        });
      }
    }
  }

  return diagnostics;
}
