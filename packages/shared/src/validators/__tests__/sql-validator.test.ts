import { describe, test, expect } from 'bun:test';
import {
  validateSql,
  splitSqlStatements,
  detectSqlType,
  isForbiddenSql,
  validateWhereClause,
  generatePrecheckSql,
  extractTableName,
  validatePrecheckMatch,
} from '../index';

describe('SQL Splitter', () => {
  test('should split multiple statements by semicolon', () => {
    const result = splitSqlStatements('SELECT 1; SELECT 2; SELECT 3');
    expect(result.statements).toHaveLength(3);
    expect(result.statements[0]).toBe('SELECT 1');
    expect(result.statements[1]).toBe('SELECT 2');
    expect(result.statements[2]).toBe('SELECT 3');
  });

  test('should handle semicolons inside single quotes', () => {
    const result = splitSqlStatements("SELECT * FROM users WHERE name = 'test;name'; SELECT 1");
    expect(result.statements).toHaveLength(2);
    expect(result.statements[0]).toBe("SELECT * FROM users WHERE name = 'test;name'");
    expect(result.statements[1]).toBe('SELECT 1');
  });

  test('should handle semicolons inside double quotes', () => {
    const result = splitSqlStatements('SELECT * FROM users WHERE name = "test;name"; SELECT 1');
    expect(result.statements).toHaveLength(2);
    expect(result.statements[0]).toBe('SELECT * FROM users WHERE name = "test;name"');
  });

  test('should handle escaped quotes in strings', () => {
    const result = splitSqlStatements("SELECT 'test''s value'; SELECT 1");
    expect(result.statements).toHaveLength(2);
    expect(result.statements[0]).toBe("SELECT 'test''s value'");
  });

  test('should skip line comments', () => {
    const result = splitSqlStatements("SELECT 1; -- this is a comment\nSELECT 2");
    expect(result.statements).toHaveLength(2);
    expect(result.statements[0]).toBe('SELECT 1');
    expect(result.statements[1]).toBe('SELECT 2');
  });

  test('should skip block comments', () => {
    const result = splitSqlStatements('SELECT 1; /* comment; with semicolon */ SELECT 2');
    expect(result.statements).toHaveLength(2);
    expect(result.statements[0]).toBe('SELECT 1');
    expect(result.statements[1]).toBe('SELECT 2');
  });

  test('should reject DELIMITER statements', () => {
    const result = splitSqlStatements('DELIMITER $$; SELECT 1');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('DELIMITER');
  });

  test('should handle backtick-quoted identifiers', () => {
    const result = splitSqlStatements('SELECT * FROM `table;name`; SELECT 1');
    expect(result.statements).toHaveLength(2);
    expect(result.statements[0]).toBe('SELECT * FROM `table;name`');
  });

  test('should handle empty statements', () => {
    const result = splitSqlStatements('  ;  ;  ');
    expect(result.statements).toHaveLength(0);
  });
});

describe('SQL Type Detector', () => {
  test('should detect SELECT type', () => {
    const result = detectSqlType('SELECT * FROM users');
    expect(result.type).toBe('select');
  });

  test('should detect UPDATE type', () => {
    const result = detectSqlType('UPDATE users SET name = "test" WHERE id = 1');
    expect(result.type).toBe('update');
  });

  test('should detect DELETE type', () => {
    const result = detectSqlType('DELETE FROM users WHERE id = 1');
    expect(result.type).toBe('delete');
  });

  test('should detect forbidden CREATE type', () => {
    const result = detectSqlType('CREATE TABLE test (id INT)');
    expect(result.type).toBe('forbidden');
    expect(result.error).toContain('DDL');
  });

  test('should detect forbidden DROP type', () => {
    const result = detectSqlType('DROP TABLE users');
    expect(result.type).toBe('forbidden');
    expect(result.error).toContain('DDL');
  });

  test('should detect forbidden ALTER type', () => {
    const result = detectSqlType('ALTER TABLE users ADD column email VARCHAR(255)');
    expect(result.type).toBe('forbidden');
    expect(result.error).toContain('DDL');
  });

  test('should detect forbidden TRUNCATE type', () => {
    const result = detectSqlType('TRUNCATE TABLE users');
    expect(result.type).toBe('forbidden');
    expect(result.error).toContain('DDL');
  });

  test('should detect forbidden INSERT type', () => {
    const result = detectSqlType("INSERT INTO users (name) VALUES ('test')");
    expect(result.type).toBe('forbidden');
    expect(result.error).toContain('INSERT');
  });

  test('should return unknown for invalid SQL', () => {
    const result = detectSqlType('THIS IS NOT SQL');
    expect(result.type).toBe('unknown');
    expect(result.error).toBeDefined();
  });
});

describe('Forbidden Detector', () => {
  test('should detect CREATE TABLE', () => {
    const result = isForbiddenSql('CREATE TABLE test (id INT)');
    expect(result.forbidden).toBe(true);
    expect(result.reason).toContain('CREATE');
  });

  test('should detect GRANT statements', () => {
    const result = isForbiddenSql('GRANT ALL ON *.* TO user');
    expect(result.forbidden).toBe(true);
    expect(result.reason).toContain('GRANT');
  });

  test('should detect REVOKE statements', () => {
    const result = isForbiddenSql('REVOKE ALL ON *.* FROM user');
    expect(result.forbidden).toBe(true);
    expect(result.reason).toContain('REVOKE');
  });

  test('should detect CALL statements', () => {
    const result = isForbiddenSql('CALL my_procedure()');
    expect(result.forbidden).toBe(true);
    expect(result.reason).toContain('CALL');
  });

  test('should detect DELIMITER statements', () => {
    const result = isForbiddenSql('DELIMITER $$');
    expect(result.forbidden).toBe(true);
    expect(result.reason).toContain('DELIMITER');
  });

  test('should detect LOAD DATA', () => {
    const result = isForbiddenSql("LOAD DATA INFILE '/tmp/data.txt' INTO TABLE users");
    expect(result.forbidden).toBe(true);
    expect(result.reason).toContain('LOAD DATA');
  });

  test('should detect INTO OUTFILE', () => {
    const result = isForbiddenSql("SELECT * FROM users INTO OUTFILE '/tmp/out.txt'");
    expect(result.forbidden).toBe(true);
    expect(result.reason).toContain('OUTFILE');
  });

  test('should allow SELECT statements', () => {
    const result = isForbiddenSql('SELECT * FROM users WHERE id = 1');
    expect(result.forbidden).toBe(false);
  });

  test('should allow UPDATE with WHERE', () => {
    const result = isForbiddenSql('UPDATE users SET name = "test" WHERE id = 1');
    expect(result.forbidden).toBe(false);
  });

  test('should allow DELETE with WHERE', () => {
    const result = isForbiddenSql('DELETE FROM users WHERE id = 1');
    expect(result.forbidden).toBe(false);
  });
});

describe('WHERE Validator', () => {
  test('should pass UPDATE with valid WHERE', () => {
    const result = validateWhereClause('UPDATE users SET name = "test" WHERE id = 1', 'update');
    expect(result.valid).toBe(true);
    expect(result.hasWhere).toBe(true);
    expect(result.isDangerous).toBe(false);
  });

  test('should pass DELETE with valid WHERE', () => {
    const result = validateWhereClause('DELETE FROM users WHERE id = 1', 'delete');
    expect(result.valid).toBe(true);
    expect(result.hasWhere).toBe(true);
    expect(result.isDangerous).toBe(false);
  });

  test('should fail UPDATE without WHERE', () => {
    const result = validateWhereClause('UPDATE users SET name = "test"', 'update');
    expect(result.valid).toBe(false);
    expect(result.hasWhere).toBe(false);
    expect(result.error).toContain('WHERE');
  });

  test('should fail DELETE without WHERE', () => {
    const result = validateWhereClause('DELETE FROM users', 'delete');
    expect(result.valid).toBe(false);
    expect(result.hasWhere).toBe(false);
    expect(result.error).toContain('WHERE');
  });

  test('should detect WHERE 1=1 as dangerous', () => {
    const result = validateWhereClause('UPDATE users SET name = "test" WHERE 1=1', 'update');
    expect(result.valid).toBe(false);
    expect(result.isDangerous).toBe(true);
    expect(result.error).toContain('Dangerous');
  });

  test('should detect WHERE true as dangerous', () => {
    const result = validateWhereClause('DELETE FROM users WHERE true', 'delete');
    expect(result.valid).toBe(false);
    expect(result.isDangerous).toBe(true);
  });

  test('should detect WHERE "a"="a" as dangerous', () => {
    const result = validateWhereClause('UPDATE users SET name = "test" WHERE "a"="a"', 'update');
    expect(result.valid).toBe(false);
    expect(result.isDangerous).toBe(true);
  });

  test('should pass complex WHERE conditions', () => {
    const result = validateWhereClause(
      'UPDATE users SET status = "inactive" WHERE created_at < "2024-01-01" AND role = "guest"',
      'update'
    );
    expect(result.valid).toBe(true);
    expect(result.hasWhere).toBe(true);
    expect(result.isDangerous).toBe(false);
  });
});

describe('Precheck Generator', () => {
  test('should generate precheck for UPDATE', () => {
    const result = generatePrecheckSql(
      'UPDATE users SET status = "inactive" WHERE role = "guest"'
    );
    expect(result.success).toBe(true);
    expect(result.precheckSql).toContain('SELECT COUNT(*)');
    expect(result.precheckSql).toContain('affected_count');
    expect(result.precheckSql).toContain('users');
    expect(result.tableName).toBe('users');
  });

  test('should generate precheck for DELETE', () => {
    const result = generatePrecheckSql('DELETE FROM logs WHERE level = "debug"');
    expect(result.success).toBe(true);
    expect(result.precheckSql).toContain('SELECT COUNT(*)');
    expect(result.precheckSql).toContain('logs');
    expect(result.tableName).toBe('logs');
  });

  test('should fail for SELECT statements', () => {
    const result = generatePrecheckSql('SELECT * FROM users');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot generate precheck');
  });

  test('should fail for statements without WHERE', () => {
    const result = generatePrecheckSql('UPDATE users SET name = "test"');
    expect(result.success).toBe(false);
    expect(result.error).toContain('no WHERE');
  });

  test('should preserve complex WHERE conditions', () => {
    const result = generatePrecheckSql(
      "UPDATE users SET status = 'inactive' WHERE created_at < '2024-01-01' AND role = 'guest'"
    );
    expect(result.success).toBe(true);
    expect(result.precheckSql).toContain('created_at');
    expect(result.precheckSql).toContain('role');
  });
});

describe('Table Name Extractor', () => {
  test('should extract table from UPDATE', () => {
    const name = extractTableName('UPDATE users SET name = "test" WHERE id = 1');
    expect(name).toBe('users');
  });

  test('should extract table from DELETE', () => {
    const name = extractTableName('DELETE FROM logs WHERE id = 1');
    expect(name).toBe('logs');
  });

  test('should extract table from SELECT', () => {
    const name = extractTableName('SELECT * FROM products WHERE id = 1');
    expect(name).toBe('products');
  });

  test('should return null for invalid SQL', () => {
    const name = extractTableName('NOT VALID SQL');
    expect(name).toBeNull();
  });
});

describe('Precheck Match Validator', () => {
  test('should validate matching tables', () => {
    const result = validatePrecheckMatch(
      'SELECT COUNT(*) FROM users WHERE id = 1',
      'UPDATE users SET name = "test" WHERE id = 1'
    );
    expect(result).toBe(true);
  });

  test('should reject mismatched tables', () => {
    const result = validatePrecheckMatch(
      'SELECT COUNT(*) FROM orders WHERE id = 1',
      'UPDATE users SET name = "test" WHERE id = 1'
    );
    expect(result).toBe(false);
  });

  test('should be case insensitive', () => {
    const result = validatePrecheckMatch(
      'SELECT COUNT(*) FROM USERS WHERE id = 1',
      'UPDATE users SET name = "test" WHERE id = 1'
    );
    expect(result).toBe(true);
  });
});

describe('Main SQL Validator', () => {
  describe('SELECT statements', () => {
    test('should allow simple SELECT', () => {
      const result = validateSql('SELECT * FROM users');
      expect(result.valid).toBe(true);
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].type).toBe('select');
      expect(result.statements[0].requiresPrecheck).toBe(false);
    });

    test('should allow SELECT with WHERE', () => {
      const result = validateSql('SELECT * FROM users WHERE id = 1');
      expect(result.valid).toBe(true);
    });

    test('should allow SELECT with complex conditions', () => {
      const result = validateSql(
        'SELECT u.*, o.total FROM users u JOIN orders o ON u.id = o.user_id WHERE u.status = "active"'
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('UPDATE statements', () => {
    test('should allow UPDATE with WHERE', () => {
      const result = validateSql('UPDATE users SET name = "test" WHERE id = 1');
      expect(result.valid).toBe(true);
      expect(result.statements[0].type).toBe('update');
      expect(result.statements[0].requiresPrecheck).toBe(true);
      expect(result.statements[0].suggestedPrecheck).toBeDefined();
    });

    test('should reject UPDATE without WHERE', () => {
      const result = validateSql('UPDATE users SET name = "test"');
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('WHERE');
    });

    test('should reject UPDATE with WHERE 1=1', () => {
      const result = validateSql('UPDATE users SET name = "test" WHERE 1=1');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Dangerous');
    });
  });

  describe('DELETE statements', () => {
    test('should allow DELETE with WHERE', () => {
      const result = validateSql('DELETE FROM logs WHERE created_at < "2024-01-01"');
      expect(result.valid).toBe(true);
      expect(result.statements[0].type).toBe('delete');
      expect(result.statements[0].requiresPrecheck).toBe(true);
    });

    test('should reject DELETE without WHERE', () => {
      const result = validateSql('DELETE FROM users');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('WHERE');
    });

    test('should reject DELETE with WHERE true', () => {
      const result = validateSql('DELETE FROM users WHERE true');
      expect(result.valid).toBe(false);
    });
  });

  describe('Forbidden statements', () => {
    test('should reject CREATE TABLE', () => {
      const result = validateSql('CREATE TABLE test (id INT)');
      expect(result.valid).toBe(false);
      expect(result.statements[0].type).toBe('forbidden');
    });

    test('should reject DROP TABLE', () => {
      const result = validateSql('DROP TABLE users');
      expect(result.valid).toBe(false);
    });

    test('should reject ALTER TABLE', () => {
      const result = validateSql('ALTER TABLE users ADD COLUMN email VARCHAR(255)');
      expect(result.valid).toBe(false);
    });

    test('should reject TRUNCATE', () => {
      const result = validateSql('TRUNCATE TABLE users');
      expect(result.valid).toBe(false);
    });

    test('should reject GRANT', () => {
      const result = validateSql('GRANT ALL ON *.* TO user');
      expect(result.valid).toBe(false);
    });

    test('should reject INSERT', () => {
      const result = validateSql("INSERT INTO users (name) VALUES ('test')");
      expect(result.valid).toBe(false);
    });
  });

  describe('Multiple statements', () => {
    test('should validate all statements', () => {
      const result = validateSql(`
        SELECT * FROM users;
        UPDATE users SET name = 'test' WHERE id = 1;
        DELETE FROM logs WHERE created_at < '2024-01-01';
      `);
      expect(result.valid).toBe(true);
      expect(result.statements).toHaveLength(3);
      expect(result.statements[0].type).toBe('select');
      expect(result.statements[1].type).toBe('update');
      expect(result.statements[2].type).toBe('delete');
    });

    test('should fail if any statement is invalid', () => {
      const result = validateSql(`
        SELECT * FROM users;
        UPDATE users SET name = 'test';
        DELETE FROM logs WHERE id = 1;
      `);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Statement #2');
    });

    test('should handle semicolons in strings correctly', () => {
      const result = validateSql(`
        SELECT * FROM users WHERE name = 'test;name';
        UPDATE users SET email = 'test@example.com' WHERE id = 1;
      `);
      expect(result.valid).toBe(true);
      expect(result.statements).toHaveLength(2);
    });

    test('should skip comments', () => {
      const result = validateSql(`
        -- This is a comment
        SELECT * FROM users;
        /* Block comment */
        UPDATE users SET name = 'test' WHERE id = 1;
      `);
      expect(result.valid).toBe(true);
      expect(result.statements).toHaveLength(2);
    });
  });

  describe('Edge cases', () => {
    test('should reject empty input', () => {
      const result = validateSql('');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('empty');
    });

    test('should reject whitespace-only input', () => {
      const result = validateSql('   \n\t  ');
      expect(result.valid).toBe(false);
    });

    test('should reject invalid SQL syntax', () => {
      const result = validateSql('SELECTT * FORM users');
      expect(result.valid).toBe(false);
      expect(result.statements[0].type).toBe('unknown');
    });

    test('should handle complex nested queries', () => {
      const result = validateSql(
        'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders WHERE total > 100)'
      );
      expect(result.valid).toBe(true);
    });
  });
});
