# SQL Ops Executor

SQL 执行服务 - 负责接收来自 Console 的 SQL 执行请求并路由到目标数据库执行。

## 功能特性

- **安全执行**：HMAC-SHA256 签名验证，防止未授权访问和请求重放
- **多目标支持**：支持连接多个 PolarDB MySQL、AnalyticDB 和 Redis 实例
- **连接池管理**：智能连接池，自动管理数据库连接生命周期
- **会话管理**：跟踪和管理 MySQL 会话，支持会话终止
- **健康检查**：多层级健康检查，支持服务和数据库级别监控
- **灵活配置**：支持多种配置模式，适应不同部署环境

## 快速开始

### 环境要求

- Bun >= 1.0
- Node.js >= 20（可选）

### 安装

```bash
# 安装依赖
bun install

# 复制环境变量示例
cp .env.example .env

# 编辑 .env 配置数据库连接
```

### 开发

```bash
# 启动开发服务器
bun run dev

# 运行测试
bun test

# 类型检查
bun run typecheck
```

### 生产构建

```bash
# 构建
bun run build

# 启动
bun start
```

## 配置

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PORT` | 服务端口 | `8787` |
| `CLUSTER_NAME` | 集群标识名称 | `default` |
| `EXECUTOR_SIGNING_SECRET` | HMAC 签名密钥 | - |
| `SKIP_SIGNATURE_VALIDATION` | 跳过签名验证（仅开发） | `false` |

### 数据库配置

支持 4 种配置模式（按优先级排序）：

#### 1. JSON 配置

```bash
SERVICE_DB_CONFIG_JSON='{"default":{"polardb_mysql":{"primary":{"host":"...","port":3306,"database":"...","user":"...","password":"..."}}}}'
```

#### 2. 独立环境变量

```bash
US1_POLARDB_PRIMARY_HOST=localhost
US1_POLARDB_PRIMARY_PORT=3306
US1_POLARDB_PRIMARY_DATABASE=mydb
US1_POLARDB_PRIMARY_USER=root
US1_POLARDB_PRIMARY_PASSWORD=password
```

#### 3. URL 环境变量

```bash
DATABASE_URL=mysql://user:password@host:3306/database
DATABASE_URL_ADB=mysql://user:password@host:3306/adb
```

#### 4. Doppler 动态配置

```bash
TARGET_DB_DOPPLER_TOKEN=dp.st.xxx
```

## API 文档

### 公开端点

#### `GET /`
返回服务信息。

**响应**：
```json
{
  "name": "SQL Ops Executor",
  "version": "0.0.1"
}
```

#### `GET /api/v1/health`
基础健康检查。

**响应**：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### `GET /api/v1/health/detailed`
详细健康检查，包含数据库连接状态。

**响应**：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "database": {
    "healthy": true,
    "targets": [
      {
        "clusterId": "default",
        "dbType": "polardb_mysql",
        "code": "primary",
        "available": true,
        "latencyMs": 5
      }
    ]
  }
}
```

#### `GET /api/v1/health/pools`
连接池统计信息。

**响应**：
```json
{
  "timestamp": "2024-01-01T00:00:00.000Z",
  "pools": [
    {
      "key": "default:polardb_mysql:primary",
      "activeConnections": 2,
      "idleConnections": 3,
      "waitingRequests": 0
    }
  ]
}
```

### 受保护端点

以下端点需要 HMAC-SHA256 签名验证。

#### 请求签名

所有受保护端点必须包含以下请求头：

| 请求头 | 说明 |
|--------|------|
| `X-Timestamp` | 请求时间戳（毫秒） |
| `X-Nonce` | 唯一随机字符串 |
| `X-Signature` | HMAC-SHA256 签名 |
| `X-Trace-ID` | 追踪 ID（可选） |

签名计算：
```
payload = "${method}\n${path}\n${timestamp}\n${nonce}\n${body}"
signature = HMAC-SHA256(payload, secret)
```

#### `POST /api/v1/execute`
执行 SQL 语句。

**请求**：
```json
{
  "target": "default/polardb_mysql/primary",
  "statementType": "SELECT",
  "sql": "SELECT * FROM users LIMIT 10",
  "timeoutMs": 30000,
  "statementId": "stmt_123",
  "requestId": "req_456"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "rows": [...],
    "affectedRows": 0,
    "executionTimeMs": 15
  }
}
```

#### `POST /api/v1/execute/precheck`
预检查 SQL 语句影响的行数。

**请求**：
```json
{
  "target": "default/polardb_mysql/primary",
  "precheckSql": "SELECT COUNT(*) as cnt FROM users WHERE status = 'inactive'"
}
```

**响应**：
```json
{
  "success": true,
  "data": {
    "affectedRows": 150,
    "executionTimeMs": 10
  }
}
```

#### `GET /api/v1/sessions`
列出活动数据库会话。

**查询参数**：
- `clusterId` - 集群 ID
- `code` - 数据库代码

**响应**：
```json
{
  "sessions": [
    {
      "id": 12345,
      "user": "app_user",
      "host": "192.168.1.1:54321",
      "db": "mydb",
      "command": "Query",
      "time": 5,
      "state": "executing",
      "info": "SELECT * FROM ...",
      "isSystemOwned": true
    }
  ]
}
```

#### `POST /api/v1/sessions/kill`
终止指定会话。

**请求**：
```json
{
  "target": "default/polardb_mysql/primary",
  "processId": 12345
}
```

**响应**：
```json
{
  "success": true,
  "message": "Session 12345 terminated"
}
```

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                         Console                              │
│                    (Next.js 管理后台)                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HMAC-SHA256 签名请求
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Executor                              │
│                     (Hono HTTP 服务)                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   signing   │  │   execute   │  │  sessions   │         │
│  │ middleware  │  │   routes    │  │   routes    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         │                │                │                 │
│         ▼                ▼                ▼                 │
│  ┌─────────────────────────────────────────────────┐       │
│  │              executor service                    │       │
│  │         (SQL 执行 + 进程跟踪)                     │       │
│  └─────────────────────────────────────────────────┘       │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────┐       │
│  │           connection pool manager                │       │
│  │              (连接池管理)                         │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
        ┌─────────────────────────────────────────┐
        │           Target Databases               │
        │  ├── PolarDB MySQL                      │
        │  ├── AnalyticDB (ADB)                   │
        │  └── Redis                              │
        └─────────────────────────────────────────┘
```

## 部署

### 阿里云函数计算 (FC 3.0)

使用 Serverless-devs 部署：

```bash
# 安装 Serverless-devs
npm install -g @serverless-devs/s

# 部署
s deploy
```

配置文件 `s.yaml` 已预配置好部署参数。

### Docker

```dockerfile
FROM oven/bun:1

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

EXPOSE 8787
CMD ["bun", "start"]
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sql-ops-executor
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: executor
        image: sql-ops-executor:latest
        ports:
        - containerPort: 8787
        env:
        - name: CLUSTER_NAME
          value: "production"
        - name: EXECUTOR_SIGNING_SECRET
          valueFrom:
            secretKeyRef:
              name: executor-secrets
              key: signing-secret
```

## 安全

- 所有执行端点都需要 HMAC-SHA256 签名验证
- 支持 Nonce 防重放攻击
- 5 分钟时间戳窗口防止时间漂移攻击
- 数据库凭证应通过 Doppler 或 Kubernetes Secrets 管理
- 日志中不会输出敏感信息

## 监控

### 健康检查

- `/api/v1/health` - 用于负载均衡器探活
- `/api/v1/health/detailed` - 用于详细监控
- `/api/v1/health/pools` - 用于连接池监控

### 日志

所有日志使用模块前缀格式：
```
[Executor] Database configuration initialized
[DbConfig] Loaded from URL environment variables
[signing] Request verified
```

## 许可证

Private - SQL Ops Console 项目专用
