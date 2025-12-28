# SQL 校验规则

## 1. 总体原则

把"安全"变成机器可判断的规则，减少歧义与返工。

校验分两层执行：
1. **Console 端**：创建请求时校验
2. **Executor 端**：执行前二次校验（防止绕过）

## 2. 允许的语句类型

### 2.1 MVP 允许

| 类型 | 说明 |
|------|------|
| SELECT | 查询语句 |
| UPDATE | 更新语句（必须有 WHERE） |
| DELETE | 删除语句（必须有 WHERE） |

### 2.2 禁止的语句类型

| 类型 | 说明 |
|------|------|
| DDL | CREATE, ALTER, DROP, TRUNCATE |
| 权限操作 | GRANT, REVOKE |
| 配置修改 | SET |
| 存储过程 | CALL, EXECUTE |
| 分隔符 | DELIMITER |
| 复杂脚本 | 存储过程/函数体 |

### 2.3 校验结果

- 包含禁止类型 → **拒绝提交**，给出明确错误
- 无法识别的类型（unknown）→ **拒绝提交**

## 3. UPDATE/DELETE 强制规则

### 3.1 必须包含 WHERE

```sql
-- ✓ 允许
UPDATE users SET status = 'inactive' WHERE id = 123;
DELETE FROM logs WHERE created_at < '2024-01-01';

-- ✗ 禁止
UPDATE users SET status = 'inactive';
DELETE FROM logs;
```

### 3.2 禁止 WHERE 1=1

```sql
-- ✗ 禁止（视为高风险）
UPDATE users SET status = 'inactive' WHERE 1=1;
DELETE FROM logs WHERE 1=1;
```

### 3.3 校验正则

```typescript
const FORBIDDEN_WHERE_PATTERNS = [
  /WHERE\s+1\s*=\s*1/i,
  /WHERE\s+true/i,
  /WHERE\s+'.*'\s*=\s*'.*'/i,  // WHERE 'a'='a'
];
```

## 4. 预检语句规则

### 4.1 何时需要预检

当请求中包含 UPDATE 或 DELETE 时，**必须**提供对应的预检语句。

### 4.2 预检语句格式

预检必须是以下两种之一：

```sql
-- 方式一：COUNT 查询
SELECT COUNT(*) AS affected_count FROM table_name WHERE conditions;

-- 方式二：主键查询
SELECT id FROM table_name WHERE conditions;
```

### 4.3 预检与写语句的关联

预检必须与写语句指向**同一张主表**。

MVP 实现弱校验：提取 FROM/UPDATE/DELETE 后的表名进行匹配。

```typescript
function validatePrecheckMatch(precheckSql: string, writeSql: string): boolean {
  const precheckTable = extractTableName(precheckSql);
  const writeTable = extractTableName(writeSql);
  return precheckTable === writeTable;
}
```

### 4.4 预检结果展示

执行前，预检结果必须在界面上展示给用户确认。

## 5. 影响行数阈值

### 5.1 默认阈值

```typescript
const MAX_AFFECTED_ROWS = 1000;
```

### 5.2 超阈值处理

若预检结果行数 > 1000：
- 仍可审批
- 执行时必须额外输入 `CONFIRM_LARGE_CHANGE`
- 必须填写原因（reason）
- 原因写入审计日志

## 6. SQL 拆分规则

### 6.1 基本拆分

使用 `;` 分隔语句。

### 6.2 需要正确处理

- 单引号/双引号内的 `;`
- `--` 行注释
- `/* */` 块注释

### 6.3 拆分示例

```sql
-- 输入
SELECT * FROM users WHERE name = 'test;name'; -- 注释
UPDATE users SET status = 'active' WHERE id = 1;

-- 输出（2 条语句）
1. SELECT * FROM users WHERE name = 'test;name'
2. UPDATE users SET status = 'active' WHERE id = 1
```

### 6.4 不支持的内容

出现以下内容则**拒绝提交**：

- `DELIMITER` 语句
- 存储过程/函数体
- 多行复杂脚本（自定义分隔符）

## 7. 实现参考

### 7.1 使用 node-sql-parser

```typescript
import { Parser } from 'node-sql-parser';

const parser = new Parser();

function parseAndValidate(sql: string): ValidationResult {
  try {
    const ast = parser.astify(sql, { database: 'MySQL' });
    // 分析 AST...
  } catch (e) {
    return { valid: false, error: `SQL 语法错误: ${e.message}` };
  }
}
```

### 7.2 校验流程

```
原始 SQL 输入
      │
      ▼
  SQL 拆分
      │
      ├── 拆分失败 → 拒绝提交
      │
      ▼
遍历每条语句
      │
      ├── 解析失败 → 拒绝提交
      │
      ├── 禁止类型 → 拒绝提交
      │
      ├── UPDATE/DELETE 无 WHERE → 拒绝提交
      │
      ├── WHERE 1=1 → 拒绝提交
      │
      ▼
标记需要预检的语句
      │
      ▼
返回校验结果
```

### 7.3 校验结果结构

```typescript
interface ValidationResult {
  valid: boolean;
  statements: StatementValidation[];
  errors: string[];
  warnings: string[];
}

interface StatementValidation {
  index: number;
  sql: string;
  type: 'select' | 'update' | 'delete' | 'forbidden' | 'unknown';
  valid: boolean;
  requiresPrecheck: boolean;
  suggestedPrecheck?: string;
  errors: string[];
  warnings: string[];
}
```

## 8. 错误信息规范

### 8.1 禁止类型

```
错误：不允许执行 DDL 语句 (CREATE/ALTER/DROP/TRUNCATE)
位置：语句 #1
```

### 8.2 缺少 WHERE

```
错误：UPDATE 语句必须包含 WHERE 子句
位置：语句 #2
```

### 8.3 危险 WHERE

```
错误：WHERE 1=1 被视为高风险操作，不允许提交
位置：语句 #3
```

### 8.4 语法错误

```
错误：SQL 语法错误 - Unexpected token 'FORM' at line 1
位置：语句 #1
```

## 9. 自动生成预检 SQL

### 9.1 从 UPDATE 生成

```sql
-- 原语句
UPDATE users SET status = 'inactive' WHERE role = 'guest' AND created_at < '2024-01-01';

-- 生成的预检
SELECT COUNT(*) AS affected_count FROM users WHERE role = 'guest' AND created_at < '2024-01-01';
```

### 9.2 从 DELETE 生成

```sql
-- 原语句
DELETE FROM logs WHERE level = 'debug';

-- 生成的预检
SELECT COUNT(*) AS affected_count FROM logs WHERE level = 'debug';
```

### 9.3 实现逻辑

```typescript
function generatePrecheck(ast: AST): string {
  const table = ast.from?.[0]?.table || ast.table?.[0]?.table;
  const whereClause = parser.sqlify(ast.where, { database: 'MySQL' });
  return `SELECT COUNT(*) AS affected_count FROM ${table} WHERE ${whereClause}`;
}
```
