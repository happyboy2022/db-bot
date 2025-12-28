# 阶段三：SQL 校验

## 概述

本阶段实现 SQL 解析与校验模块，作为共享包供 Console 和 Executor 使用。

## 任务列表

### T-009: SQL 解析与校验器

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-004**
- **可并行：是**（独立模块）

#### 任务描述

使用 node-sql-parser 实现 SQL 解析、校验和预检生成功能。

参考文档：[SQL 校验规则](../specs/sql-validation.md)

#### 详细步骤

1. 安装依赖：
   ```bash
   cd packages/shared
   bun add node-sql-parser
   ```

2. 创建 SQL 拆分器（`src/validators/sql-splitter.ts`）：
   ```typescript
   /**
    * 将多条 SQL 语句拆分为数组
    * 需要正确处理：
    * - 引号内的分号
    * - 注释内的分号
    */
   export function splitSqlStatements(sql: string): string[] {
     // 实现拆分逻辑
   }
   ```

3. 创建语句类型识别器（`src/validators/sql-type-detector.ts`）：
   ```typescript
   import { Parser } from 'node-sql-parser';

   export type SqlType = 'select' | 'update' | 'delete' | 'forbidden' | 'unknown';

   export function detectSqlType(sql: string): SqlType {
     const parser = new Parser();
     try {
       const ast = parser.astify(sql, { database: 'MySQL' });
       // 识别语句类型
     } catch {
       return 'unknown';
     }
   }
   ```

4. 创建禁止语句检测器（`src/validators/forbidden-detector.ts`）：
   ```typescript
   const FORBIDDEN_PATTERNS = [
     /\bCREATE\b/i,
     /\bALTER\b/i,
     /\bDROP\b/i,
     /\bTRUNCATE\b/i,
     /\bGRANT\b/i,
     /\bREVOKE\b/i,
     /\bSET\b\s+/i,
     /\bCALL\b/i,
     /\bDELIMITER\b/i,
   ];

   export function isForbiddenSql(sql: string): { forbidden: boolean; reason?: string } {
     // 检测禁止的语句
   }
   ```

5. 创建 WHERE 子句校验器（`src/validators/where-validator.ts`）：
   ```typescript
   import { Parser } from 'node-sql-parser';

   export function validateWhereClause(sql: string): {
     valid: boolean;
     hasWhere: boolean;
     isDangerous: boolean;
     error?: string;
   } {
     // 检查 UPDATE/DELETE 是否有 WHERE
     // 检查 WHERE 1=1 等危险模式
   }
   ```

6. 创建预检 SQL 生成器（`src/validators/precheck-generator.ts`）：
   ```typescript
   import { Parser } from 'node-sql-parser';

   export function generatePrecheckSql(writeSql: string): string | null {
     const parser = new Parser();
     try {
       const ast = parser.astify(writeSql, { database: 'MySQL' });
       // 提取表名和 WHERE 条件
       // 生成 SELECT COUNT(*) 语句
     } catch {
       return null;
     }
   }
   ```

7. 创建主校验器（`src/validators/sql-validator.ts`）：
   ```typescript
   export interface ValidationResult {
     valid: boolean;
     statements: StatementValidation[];
     errors: string[];
     warnings: string[];
   }

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

   export function validateSql(rawSql: string): ValidationResult {
     // 1. 拆分语句
     // 2. 遍历每条语句
     // 3. 检测类型
     // 4. 检查禁止语句
     // 5. 检查 WHERE 子句
     // 6. 生成预检建议
     // 7. 汇总结果
   }
   ```

8. 创建单元测试（`src/validators/__tests__/sql-validator.test.ts`）：
   ```typescript
   describe('SQL Validator', () => {
     test('应该允许 SELECT 语句', () => {});
     test('应该允许带 WHERE 的 UPDATE', () => {});
     test('应该拒绝无 WHERE 的 DELETE', () => {});
     test('应该拒绝 DDL 语句', () => {});
     test('应该拒绝 WHERE 1=1', () => {});
     test('应该正确拆分多条语句', () => {});
     test('应该处理引号内的分号', () => {});
     test('应该处理注释内的分号', () => {});
     test('应该生成正确的预检 SQL', () => {});
   });
   ```

#### 产出文件

- `packages/shared/src/validators/sql-splitter.ts`
- `packages/shared/src/validators/sql-type-detector.ts`
- `packages/shared/src/validators/forbidden-detector.ts`
- `packages/shared/src/validators/where-validator.ts`
- `packages/shared/src/validators/precheck-generator.ts`
- `packages/shared/src/validators/sql-validator.ts`
- `packages/shared/src/validators/index.ts`
- `packages/shared/src/validators/__tests__/sql-validator.test.ts`

#### 验收标准

- [x] 正确识别 SELECT/UPDATE/DELETE 类型
- [x] 正确检测禁止的语句类型（DDL、GRANT 等）
- [x] UPDATE/DELETE 无 WHERE 返回错误
- [x] WHERE 1=1 返回错误
- [x] 正确拆分多条 SQL 语句
- [x] 正确处理引号和注释中的分号
- [x] 正确生成预检 SQL
- [x] 所有单元测试通过（55 tests）

#### 测试用例示例

```typescript
// 应该通过
validateSql('SELECT * FROM users WHERE id = 1');
validateSql('UPDATE users SET name = "test" WHERE id = 1');
validateSql('DELETE FROM logs WHERE created_at < "2024-01-01"');

// 应该失败
validateSql('CREATE TABLE test (id INT)'); // DDL 禁止
validateSql('DROP TABLE users'); // DDL 禁止
validateSql('UPDATE users SET status = 1'); // 无 WHERE
validateSql('DELETE FROM users'); // 无 WHERE
validateSql('UPDATE users SET status = 1 WHERE 1=1'); // WHERE 1=1
validateSql('GRANT ALL ON *.* TO user'); // GRANT 禁止

// 应该正确拆分
validateSql(`
  SELECT * FROM users;
  UPDATE users SET name = 'test;name' WHERE id = 1; -- 注释
  DELETE FROM logs WHERE id = 2;
`);
// 应该拆分为 3 条语句
```
