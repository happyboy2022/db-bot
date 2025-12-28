# Executor API 契约

## 1. 概述

Executor 是部署在阿里云 FC 3.0 上的 Hono 服务，是**唯一可以访问内网数据库**的组件。

### 1.1 基础信息

- Base URL: `https://{function-name}.{region}.fc.aliyuncs.com`
- API Version: `v1`
- 认证方式: Bearer Token

### 1.2 认证

所有请求必须携带 Authorization header：

```
Authorization: Bearer {EXECUTOR_API_TOKEN}
```

Token 不正确返回 401 Unauthorized。

## 2. API 端点

### 2.1 POST /api/v1/execute

执行单条 SQL 语句。

#### 请求

```typescript
interface ExecuteRequest {
  requestId: string;      // SQL 请求 ID
  version: number;        // 版本号
  statementId: string;    // 语句 ID
  serviceId: string;      // 服务 ID
  dbType: 'polardb_mysql';
  dbRole: 'primary' | 'record';
  sql: string;            // SQL 语句
  timeoutMs?: number;     // 超时时间，默认 30000，最大 120000
}
```

#### 响应 - 成功

```typescript
// SELECT 语句
interface SelectResult {
  success: true;
  durationMs: number;
  processId: number;
  result: {
    type: 'select';
    rows: Record<string, any>[];
    columns: string[];
    rowCount: number;
    truncated: boolean;
  };
}

// UPDATE/DELETE 语句
interface WriteResult {
  success: true;
  durationMs: number;
  processId: number;
  result: {
    type: 'write';
    affectedRows: number;
  };
}
```

#### 响应 - 失败

```typescript
interface ExecuteError {
  success: false;
  durationMs: number;
  processId?: number;
  error: {
    code: string;
    message: string;
  };
}
```

#### 错误码

| Code | 说明 |
|------|------|
| SQL_VALIDATION_FAILED | SQL 校验失败（禁止的语句类型） |
| SQL_SYNTAX_ERROR | SQL 语法错误 |
| CONNECTION_FAILED | 数据库连接失败 |
| QUERY_TIMEOUT | 查询超时 |
| QUERY_ERROR | 查询执行错误 |
| UNKNOWN_TARGET | 未知的数据库目标 |

#### 示例

```bash
# 请求
curl -X POST https://executor.fc.aliyuncs.com/api/v1/execute \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "uuid-1234",
    "version": 1,
    "statementId": "stmt-uuid",
    "serviceId": "us-east-1",
    "dbType": "polardb_mysql",
    "dbRole": "primary",
    "sql": "SELECT * FROM users WHERE id = 1",
    "timeoutMs": 30000
  }'

# 响应
{
  "success": true,
  "durationMs": 45,
  "processId": 12345,
  "result": {
    "type": "select",
    "rows": [{"id": 1, "name": "Alice", "email": "alice@example.com"}],
    "columns": ["id", "name", "email"],
    "rowCount": 1,
    "truncated": false
  }
}
```

---

### 2.2 GET /api/v1/sessions

获取数据库会话列表。

#### 请求参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| serviceId | string | 是 | 服务 ID |
| dbRole | string | 是 | primary 或 record |

#### 响应

```typescript
interface SessionsResponse {
  sessions: Session[];
}

interface Session {
  id: number;           // Process ID
  user: string;         // 用户名
  host: string;         // 客户端地址
  db: string | null;    // 数据库名
  command: string;      // 命令类型
  time: number;         // 执行时间（秒）
  state: string | null; // 状态
  info: string | null;  // 正在执行的 SQL（截断）
  isSystemOwned: boolean; // 是否本系统创建
}
```

#### 示例

```bash
# 请求
curl "https://executor.fc.aliyuncs.com/api/v1/sessions?serviceId=us-east-1&dbRole=primary" \
  -H "Authorization: Bearer $TOKEN"

# 响应
{
  "sessions": [
    {
      "id": 12345,
      "user": "sql_ops_user",
      "host": "10.0.0.1:54321",
      "db": "game_db",
      "command": "Query",
      "time": 15,
      "state": "Sending data",
      "info": "SELECT * FROM users WHERE...",
      "isSystemOwned": true
    }
  ]
}
```

---

### 2.3 POST /api/v1/sessions/kill

终止数据库会话。

#### 请求

```typescript
interface KillRequest {
  serviceId: string;
  dbRole: 'primary' | 'record';
  processId: number;
  reason: string;  // 必填，写入审计
}
```

#### 响应 - 成功

```typescript
interface KillSuccess {
  success: true;
  killedProcessId: number;
}
```

#### 响应 - 失败

```typescript
interface KillError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}
```

#### 错误码

| Code | 说明 |
|------|------|
| SESSION_NOT_FOUND | 会话不存在 |
| FORBIDDEN_KILL_EXTERNAL | 不允许 kill 非本系统创建的会话 |
| KILL_FAILED | Kill 操作失败 |

#### MVP 限制

**只能 kill 本系统创建的会话**。

Executor 内部维护 processId → statementId 映射（短期缓存），用于判断会话归属。

非本系统会话返回 FORBIDDEN_KILL_EXTERNAL。

#### 示例

```bash
# 请求
curl -X POST https://executor.fc.aliyuncs.com/api/v1/sessions/kill \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceId": "us-east-1",
    "dbRole": "primary",
    "processId": 12345,
    "reason": "执行时间过长，手动终止"
  }'

# 成功响应
{
  "success": true,
  "killedProcessId": 12345
}

# 失败响应
{
  "success": false,
  "error": {
    "code": "FORBIDDEN_KILL_EXTERNAL",
    "message": "Cannot kill sessions not created by this system"
  }
}
```

---

### 2.4 GET /api/v1/health

健康检查端点。

#### 响应

```typescript
interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  version: string;
  environment: string;
  services: ServiceStatus[];
}

interface ServiceStatus {
  serviceId: string;
  name: string;
  available: boolean;
  latencyMs?: number;
}
```

#### 示例

```bash
# 请求
curl https://executor.fc.aliyuncs.com/api/v1/health \
  -H "Authorization: Bearer $TOKEN"

# 响应
{
  "status": "ok",
  "version": "1.0.0",
  "environment": "production",
  "services": [
    {
      "serviceId": "us-east-1",
      "name": "美国一服",
      "available": true,
      "latencyMs": 5
    },
    {
      "serviceId": "sg-1",
      "name": "新加坡一服",
      "available": true,
      "latencyMs": 8
    }
  ]
}
```

---

## 3. 数据库配置

### 3.1 配置来源

数据库连接信息存储在 Executor 的环境变量中，**禁止存入 Console 数据库**。

### 3.2 配置格式

方式一：JSON 配置

```bash
SERVICE_DB_CONFIG_JSON='{
  "us-east-1": {
    "polardb_mysql": {
      "primary": {
        "host": "xxx.polardb.rds.aliyuncs.com",
        "port": 3306,
        "database": "game_db",
        "user": "sql_ops_user",
        "password": "xxx"
      },
      "record": {
        "host": "xxx-ro.polardb.rds.aliyuncs.com",
        "port": 3306,
        "database": "game_db",
        "user": "sql_ops_user",
        "password": "xxx"
      }
    }
  }
}'
```

方式二：分项配置

```bash
US_EAST_1_POLARDB_PRIMARY_HOST=xxx.polardb.rds.aliyuncs.com
US_EAST_1_POLARDB_PRIMARY_PORT=3306
US_EAST_1_POLARDB_PRIMARY_DATABASE=game_db
US_EAST_1_POLARDB_PRIMARY_USER=sql_ops_user
US_EAST_1_POLARDB_PRIMARY_PASSWORD=xxx
```

### 3.3 白名单校验

Executor 必须校验 serviceId/dbRole 是否在白名单中，防止任意连库。

```typescript
function validateTarget(serviceId: string, dbRole: string): boolean {
  const config = getConfig();
  return config[serviceId]?.polardb_mysql?.[dbRole] !== undefined;
}
```

---

## 4. 安全规范

### 4.1 SQL 二次校验

Executor 在执行前必须重新校验 SQL，即使 Console 已经校验过。

校验内容：
- 禁止的语句类型（DDL、GRANT 等）
- UPDATE/DELETE 必须有 WHERE

### 4.2 Process ID 追踪

执行 SQL 时记录 MySQL processId，用于：
- 返回给 Console 记录审计
- Kill 会话时判断归属

```typescript
// 执行前获取 connection id
const [rows] = await connection.query('SELECT CONNECTION_ID() as id');
const processId = rows[0].id;

// 记录映射
processIdMap.set(processId, {
  statementId,
  requestId,
  createdAt: Date.now(),
});
```

### 4.3 超时控制

```typescript
const connection = await pool.getConnection();
await connection.query(`SET SESSION MAX_EXECUTION_TIME=${timeoutMs}`);
try {
  // 执行 SQL
} finally {
  connection.release();
}
```

---

## 5. 错误处理

### 5.1 HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功（即使 SQL 执行失败也返回 200，通过 success 字段判断） |
| 400 | 请求参数错误 |
| 401 | 认证失败 |
| 404 | 未知端点 |
| 500 | 服务器内部错误 |

### 5.2 统一错误格式

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
}
```

---

## 6. Zod Schema 定义

```typescript
import { z } from 'zod';

// Execute 请求
export const executeRequestSchema = z.object({
  requestId: z.string().uuid(),
  version: z.number().int().positive(),
  statementId: z.string().uuid(),
  serviceId: z.string().min(1),
  dbType: z.literal('polardb_mysql'),
  dbRole: z.enum(['primary', 'record']),
  sql: z.string().min(1),
  timeoutMs: z.number().int().min(1000).max(120000).default(30000),
});

// Kill 请求
export const killRequestSchema = z.object({
  serviceId: z.string().min(1),
  dbRole: z.enum(['primary', 'record']),
  processId: z.number().int().positive(),
  reason: z.string().min(1),
});

// Sessions 查询参数
export const sessionsQuerySchema = z.object({
  serviceId: z.string().min(1),
  dbRole: z.enum(['primary', 'record']),
});
```
