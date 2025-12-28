/**
 * SQL statement splitter
 * Splits multiple SQL statements by semicolon, handling:
 * - Quoted strings (single and double quotes)
 * - Line comments (--)
 * - Block comments
 * - Escaped quotes within strings
 */

interface SplitResult {
  statements: string[];
  errors: string[];
}

/**
 * Split multiple SQL statements into an array
 * Correctly handles semicolons inside quotes and comments
 */
export function splitSqlStatements(sql: string): SplitResult {
  const statements: string[] = [];
  const errors: string[] = [];

  // Check for forbidden DELIMITER statement
  if (/\bDELIMITER\b/i.test(sql)) {
    return {
      statements: [],
      errors: ['DELIMITER statements are not allowed'],
    };
  }

  let current = '';
  let i = 0;
  const len = sql.length;

  while (i < len) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    // Handle line comments (--)
    if (char === '-' && nextChar === '-') {
      // Find end of line
      let commentEnd = sql.indexOf('\n', i);
      if (commentEnd === -1) {
        commentEnd = len;
      }
      // Skip the comment (don't add to current statement)
      i = commentEnd + 1;
      continue;
    }

    // Handle block comments (/* */)
    if (char === '/' && nextChar === '*') {
      const commentEnd = sql.indexOf('*/', i + 2);
      if (commentEnd === -1) {
        errors.push('Unclosed block comment');
        return { statements: [], errors };
      }
      // Skip the block comment (don't add to current statement)
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
          // Escaped quote (''), add both
          current += sql[i + 1];
          i += 2;
        } else if (c === '\\' && sql[i + 1] === "'") {
          // MySQL escaped quote (\')
          current += sql[i + 1];
          i += 2;
        } else if (c === "'") {
          // End of string
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
          // Escaped quote (""), add both
          current += sql[i + 1];
          i += 2;
        } else if (c === '\\' && sql[i + 1] === '"') {
          // MySQL escaped quote (\")
          current += sql[i + 1];
          i += 2;
        } else if (c === '"') {
          // End of string
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
          // Escaped backtick (``), add both
          current += sql[i + 1];
          i += 2;
        } else if (c === '`') {
          // End of identifier
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
        statements.push(trimmed);
      }
      current = '';
      i++;
      continue;
    }

    // Regular character
    current += char;
    i++;
  }

  // Add the last statement if not empty
  const trimmed = current.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return { statements, errors };
}
