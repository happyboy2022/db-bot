/**
 * Forbidden SQL pattern detector
 * Uses regex patterns to detect forbidden statements
 * This provides an additional layer of security beyond AST parsing
 */

interface ForbiddenResult {
  forbidden: boolean;
  reason?: string;
  pattern?: string;
}

/**
 * Patterns for forbidden SQL statements
 * These are checked before AST parsing as an extra safety measure
 */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // DML statements (forbidden in MVP)
  {
    pattern: /\bINSERT\s+(?:INTO\s+)?\w/i,
    reason: 'INSERT statements are not allowed in MVP',
  },

  // DDL statements
  {
    pattern: /\bCREATE\s+(?:TABLE|DATABASE|INDEX|VIEW|TRIGGER|PROCEDURE|FUNCTION|EVENT|USER)\b/i,
    reason: 'CREATE statements are not allowed',
  },
  {
    pattern: /\bALTER\s+(?:TABLE|DATABASE|INDEX|VIEW|TRIGGER|PROCEDURE|FUNCTION|EVENT|USER)\b/i,
    reason: 'ALTER statements are not allowed',
  },
  {
    pattern: /\bDROP\s+(?:TABLE|DATABASE|INDEX|VIEW|TRIGGER|PROCEDURE|FUNCTION|EVENT|USER)\b/i,
    reason: 'DROP statements are not allowed',
  },
  {
    pattern: /\bTRUNCATE\s+(?:TABLE\s+)?\w/i,
    reason: 'TRUNCATE statements are not allowed',
  },

  // Permission statements
  {
    pattern: /\bGRANT\s+/i,
    reason: 'GRANT statements are not allowed',
  },
  {
    pattern: /\bREVOKE\s+/i,
    reason: 'REVOKE statements are not allowed',
  },

  // System statements
  {
    pattern: /\bSET\s+(?:GLOBAL|SESSION|@@|NAMES|CHARACTER|COLLATION)/i,
    reason: 'SET statements are not allowed',
  },

  // Stored procedures
  {
    pattern: /\bCALL\s+\w/i,
    reason: 'CALL statements (stored procedures) are not allowed',
  },

  // Delimiter (prevents multi-statement attacks)
  {
    pattern: /\bDELIMITER\b/i,
    reason: 'DELIMITER statements are not allowed',
  },

  // Additional dangerous patterns
  {
    pattern: /\bLOAD\s+DATA\b/i,
    reason: 'LOAD DATA statements are not allowed',
  },
  {
    pattern: /\bINTO\s+OUTFILE\b/i,
    reason: 'INTO OUTFILE is not allowed',
  },
  {
    pattern: /\bINTO\s+DUMPFILE\b/i,
    reason: 'INTO DUMPFILE is not allowed',
  },

  // Lock statements
  {
    pattern: /\bLOCK\s+TABLES?\b/i,
    reason: 'LOCK TABLES statements are not allowed',
  },
  {
    pattern: /\bUNLOCK\s+TABLES?\b/i,
    reason: 'UNLOCK TABLES statements are not allowed',
  },

  // Transaction control (should be managed by the system)
  {
    pattern: /\bSTART\s+TRANSACTION\b/i,
    reason: 'START TRANSACTION statements are not allowed',
  },
  {
    pattern: /\bCOMMIT\b/i,
    reason: 'COMMIT statements are not allowed',
  },
  {
    pattern: /\bROLLBACK\b/i,
    reason: 'ROLLBACK statements are not allowed',
  },
  {
    pattern: /\bSAVEPOINT\b/i,
    reason: 'SAVEPOINT statements are not allowed',
  },

  // User management
  {
    pattern: /\bCREATE\s+USER\b/i,
    reason: 'User management statements are not allowed',
  },
  {
    pattern: /\bDROP\s+USER\b/i,
    reason: 'User management statements are not allowed',
  },
  {
    pattern: /\bRENAME\s+USER\b/i,
    reason: 'User management statements are not allowed',
  },

  // Replication
  {
    pattern: /\bSTART\s+SLAVE\b/i,
    reason: 'Replication statements are not allowed',
  },
  {
    pattern: /\bSTOP\s+SLAVE\b/i,
    reason: 'Replication statements are not allowed',
  },
  {
    pattern: /\bCHANGE\s+MASTER\b/i,
    reason: 'Replication statements are not allowed',
  },

  // System commands
  {
    pattern: /\bSHUTDOWN\b/i,
    reason: 'SHUTDOWN statements are not allowed',
  },
  {
    pattern: /\bRESET\s+(?:MASTER|SLAVE|QUERY\s+CACHE)\b/i,
    reason: 'RESET statements are not allowed',
  },
  {
    pattern: /\bFLUSH\s+/i,
    reason: 'FLUSH statements are not allowed',
  },

  // Prepare statements (prevent SQL injection via prepared statements)
  {
    pattern: /\bPREPARE\s+\w+\s+FROM\b/i,
    reason: 'PREPARE statements are not allowed',
  },
  {
    pattern: /\bEXECUTE\s+\w+/i,
    reason: 'EXECUTE statements are not allowed',
  },
  {
    pattern: /\bDEALLOCATE\s+PREPARE\b/i,
    reason: 'DEALLOCATE PREPARE statements are not allowed',
  },
];

/**
 * Check if SQL contains forbidden patterns
 * This is a first-pass check before AST parsing
 */
export function isForbiddenSql(sql: string): ForbiddenResult {
  // Normalize whitespace for pattern matching
  const normalizedSql = sql.replace(/\s+/g, ' ').trim();

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalizedSql)) {
      return {
        forbidden: true,
        reason,
        pattern: pattern.source,
      };
    }
  }

  return { forbidden: false };
}

/**
 * Quick check for obviously forbidden SQL
 * This can be used as a fast pre-filter before full validation
 */
export function quickForbiddenCheck(sql: string): boolean {
  // Very quick regex check for common forbidden patterns
  const quickPatterns = /\b(?:INSERT|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DELIMITER)\b/i;
  return quickPatterns.test(sql);
}
