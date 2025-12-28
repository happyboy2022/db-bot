# SQL Ops Executor - Claude 开发配置

## 项目概述

Executor 是 SQL Ops Console 的执行服务组件，负责接收来自 Console 的 SQL 执行请求，并将其路由到目标数据库执行。

### 核心职责

- 接收并验证 SQL 执行请求（HMAC-SHA256 签名验证）
- 管理多目标数据库连接池
- 执行 SQL 语句并返回结果
- 跟踪 MySQL 进程 ID 以支持会话管理（支持 Redis/内存双模式）
- 提供健康检查和监控端点

---

## 技术栈

| 技术 | 用途 |
|------|------|
| Hono | HTTP 框架 |
| Node.js | 生产环境运行时（函数计算 FC 3.0） |
| Bun | 开发环境运行时 |
| @hono/node-server | Node.js HTTP 服务适配器 |
| MySQL2 | MySQL 数据库驱动 |
| ioredis | Redis 客户端（进程跟踪） |
| Zod | 请求验证 |
| Bun Test | 测试框架（开发环境） |
| Doppler | 环境变量管理 |

### 运行时兼容性

本项目支持双运行时环境：

| 环境 | 运行时 | 用途 |
|------|--------|------|
| 开发 | Bun | 快速开发和调试 |
| 生产 | Node.js | 阿里云函数计算 FC 3.0 |

代码自动检测运行时并选择对应的 HTTP 服务器实现：
- **Bun**: 使用 `export default { fetch }` 模式
- **Node.js**: 使用 `@hono/node-server` 的 `serve()` 函数

---

## 目录结构

```
apps/executor/
├── src/
│   ├── index.ts                    # 入口文件，应用初始化和中间件注册
│   ├── middleware/
│   │   └── signing.ts              # HMAC-SHA256 签名验证中间件
│   ├── routes/
│   │   ├── execute.ts              # SQL 执行 API (/api/v1/execute)
│   │   ├── health.ts               # 健康检查 API (/api/v1/health)
│   │   └── sessions.ts             # 会话管理 API (/api/v1/sessions)
│   ├── services/
│   │   ├── executor.ts             # SQL 执行核心逻辑
│   │   ├── process-tracker.ts      # MySQL 进程 ID 跟踪（Redis/内存双模式）
│   │   └── index.ts                # 服务导出
│   ├── db/
│   │   ├── config.ts               # 数据库配置加载器（支持 4 种模式）
│   │   ├── pool.ts                 # MySQL 连接池工厂
│   │   ├── health.ts               # 数据库健康检查
│   │   ├── validator.ts            # 目标数据库白名单验证
│   │   └── index.ts                # 数据库模块导出
│   ├── lib/
│   │   ├── url-parser.ts           # URL 解析工具（MySQL/Redis）
│   │   ├── redis/
│   │   │   ├── client.ts           # Redis 客户端（懒加载、单例）
│   │   │   ├── process-tracker.ts  # Redis 进程跟踪实现
│   │   │   └── index.ts            # Redis 模块导出
│   │   ├── doppler/
│   │   │   ├── client.ts           # Doppler API 客户端
│   │   │   ├── target-db-config.ts # 目标数据库配置加载器
│   │   │   └── index.ts            # Doppler 模块导出
│   │   └── index.ts                # 库模块导出
│   └── __tests__/                  # 测试文件（Bun Test）
├── .env.example                    # 环境变量示例
├── s.yaml                          # 阿里云函数计算配置
├── tsconfig.json                   # TypeScript 配置
└── package.json                    # 依赖配置
```

---

## 核心模块说明

### 1. 入口文件 (`src/index.ts`)

负责：
- 运行时检测（Bun/Node.js）
- 应用初始化和中间件注册
- 数据库配置预加载（使用 top-level await）
- 路由注册
- HTTP 服务器启动（根据运行时选择实现）
- 优雅关闭处理（SIGTERM/SIGINT）

### 2. 签名中间件 (`src/middleware/signing.ts`)

实现 HMAC-SHA256 请求签名验证：
- 验证 `X-Timestamp`、`X-Nonce`、`X-Signature` 请求头
- 5 分钟时间戳窗口验证
- Nonce 防重放攻击（内存 LRU 缓存）
- 支持通过 `SKIP_SIGNATURE_VALIDATION=true` 跳过验证（仅开发环境）

### 3. 数据库配置 (`src/db/config.ts`)

支持 4 种配置模式（按优先级）：
1. **JSON 模式**：`SERVICE_DB_CONFIG_JSON` 环境变量
2. **独立环境变量**：`{CLUSTER}_{DBTYPE}_{CODE}_{FIELD}` 格式
3. **URL 环境变量**：`DATABASE_URL`、`DATABASE_URL_ADB`、`REDIS_URL`
4. **Doppler 模式**：通过 `TARGET_DB_DOPPLER_TOKEN` 从 Doppler API 获取

### 4. 连接池 (`src/db/pool.ts`)

MySQL 连接池管理：
- 懒加载：首次请求时创建
- 缓存：按目标键（`clusterId:dbType:code`）缓存
- 配置：5 连接上限、10 秒连接超时、Keep-Alive

### 5. SQL 执行服务 (`src/services/executor.ts`)

核心执行逻辑：
- `executeStatement()` - 执行 SQL 语句
- `executePrecheck()` - 预检查受影响行数
- 进程 ID 跟踪用于会话管理
- 超时控制（`MAX_EXECUTION_TIME`）

### 6. 进程跟踪 (`src/services/process-tracker.ts`)

MySQL 进程 ID 跟踪，支持双模式运行：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **Redis 模式** | 跨实例共享进程状态 | 生产环境（Serverless） |
| **内存模式** | 仅本实例有效 | 开发环境或 Redis 不可用时 |

特性：
- 自动检测 Redis 可用性并选择模式
- Redis 不可用时自动降级到内存模式
- 支持终止长时间运行的查询
- 10 分钟 TTL 自动清理

### 7. Redis 客户端 (`src/lib/redis/client.ts`)

Redis 连接管理：
- 懒加载：首次使用时建立连接
- 单例模式：复用连接
- 自动重连：失败后指数退避重试
- 优雅关闭：应用退出时关闭连接

---

## API 端点

### 公开端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 服务信息（包含运行时信息） |
| GET | `/api/v1/health` | 基础健康检查 |
| GET | `/api/v1/health/detailed` | 详细健康检查（含数据库状态） |
| GET | `/api/v1/health/pools` | 连接池统计 |

### 受保护端点（需签名验证）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/execute` | 执行 SQL 语句 |
| POST | `/api/v1/execute/precheck` | 预检查受影响行数 |
| GET | `/api/v1/sessions` | 列出活动会话 |
| GET | `/api/v1/sessions/targets` | 列出可用目标 |
| GET | `/api/v1/sessions/tracked` | 列出跟踪的进程（Redis/内存） |
| POST | `/api/v1/sessions/kill` | 终止会话 |

---

## 开发指南

### 环境设置

```bash
# 1. 安装依赖
bun install

# 2. 配置环境变量（复制示例文件）
cp .env.example .env

# 3. 启动开发服务器（使用 Bun）
bun run dev
```

### 环境变量

#### Executor 服务配置

| 变量 | 说明 | 必须 |
|------|------|------|
| `CLUSTER_NAME` | 集群标识名称 | ✅ |
| `EXECUTOR_SIGNING_SECRET` | HMAC-SHA256 签名密钥 | ✅ |
| `PORT` | 服务端口（默认 8787） | ❌ |
| `SKIP_SIGNATURE_VALIDATION` | 跳过签名验证（仅开发） | ❌ |
| `TARGET_DB_DOPPLER_TOKEN` | 目标数据库 Doppler Token | ✅ |

#### 目标数据库配置（通过 TARGET_DB_DOPPLER_TOKEN 获取）

以下变量存储在 Target DB 的 Doppler 项目中，Executor 通过 `TARGET_DB_DOPPLER_TOKEN` 动态获取：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PolarDB MySQL 连接字符串 |
| `DATABASE_URL_ADB` | AnalyticDB 连接字符串 |
| `REDIS_URL` | Redis 连接字符串（用于进程跟踪） |

### 常用命令

```bash
# 开发
bun run dev              # 启动开发服务器（Bun + 热重载）

# 测试
bun run test             # 运行测试（Bun Test）
bun run test:watch       # 监听模式

# 构建和部署
bun run build            # 构建生产版本（输出到 dist/）
bun run start            # 使用 Node.js 运行生产版本
bun run start:bun        # 使用 Bun 运行生产版本
bun run deploy           # 部署到阿里云函数计算

# 代码质量
bun run typecheck        # TypeScript 类型检查
bun run lint             # ESLint 代码检查
```

---

## 编码规范

### 命名约定

| 类型 | 规范 | 示例 |
|------|------|------|
| 文件/目录 | kebab-case | `url-parser.ts` |
| 函数 | camelCase | `getTargetConfig()` |
| 类型/接口 | PascalCase | `DbTarget` |
| 常量 | UPPER_SNAKE_CASE | `CACHE_TTL_MS` |
| 环境变量 | UPPER_SNAKE_CASE | `DATABASE_URL` |

### 代码风格

- 使用 TypeScript 严格模式
- 所有公开函数必须有 JSDoc 注释
- 错误处理使用结构化错误对象
- 日志使用 `[模块名]` 前缀，如 `[Executor]`、`[DbConfig]`

### 模块导出规范

每个模块目录应有 `index.ts` 文件统一导出：
- 导出所有公开函数和类型
- 使用 `export * from './module'` 或显式导出
- 类型导出使用 `export type { ... }`

---

## 架构决策记录

### ADR-001: 多模式配置加载

**背景**：不同部署环境需要不同的配置方式
**决策**：实现 4 种配置模式的优先级链
**理由**：
- JSON 模式适合完整配置
- 独立环境变量适合 K8s
- URL 模式适合简单场景
- Doppler 模式适合动态配置

### ADR-002: 内存 Nonce 缓存

**背景**：需要防止请求重放攻击
**决策**：使用内存 LRU 缓存存储 nonce
**限制**：
- 进程重启后缓存丢失
- 多实例部署时 nonce 不共享
**未来改进**：考虑 Redis 作为共享缓存

### ADR-003: Redis/内存双模式进程跟踪

**背景**：Serverless 环境需要跨实例共享进程状态以支持终止长时间运行的查询
**决策**：实现 Redis 和内存双模式的进程跟踪器
**方案**：
- 优先使用 Redis 模式（跨实例共享）
- Redis 不可用时自动降级到内存模式
- 使用目标数据库配置中的 Redis（`REDIS_URL`）
**优势**：
- 支持跨 Serverless 实例终止查询
- 开发环境无需 Redis 也能正常工作
- 状态有 TTL 自动过期，无需手动清理

### ADR-004: 双运行时支持

**背景**：开发环境使用 Bun 提高效率，生产环境（FC 3.0）仅支持 Node.js
**决策**：代码同时支持 Bun 和 Node.js 运行时
**实现**：
- 运行时检测：`process.versions.bun`
- Bun：使用内置 HTTP 服务器（`export default { fetch }`）
- Node.js：使用 `@hono/node-server`
- 构建：`bun build --target node` 输出 Node.js 兼容代码

---

## 常见问题

### Q: 如何添加新的数据库目标？

在配置中添加新目标，支持以下方式：
1. JSON 配置：在 `SERVICE_DB_CONFIG_JSON` 中添加
2. 环境变量：添加 `{CLUSTER}_{DBTYPE}_{CODE}_{FIELD}` 格式变量
3. Doppler：在 Doppler 项目中添加 `DATABASE_URL_*` 变量

### Q: 如何调试签名验证问题？

1. 设置 `SKIP_SIGNATURE_VALIDATION=true` 跳过验证（仅开发）
2. 检查时间戳是否在 5 分钟窗口内
3. 确认签名密钥（`EXECUTOR_SIGNING_SECRET`）一致
4. 验证签名计算方法是否正确

### Q: 如何查看连接池状态？

访问 `GET /api/v1/health/pools` 查看所有连接池的统计信息。

### Q: 如何启用 Redis 进程跟踪？

在 Target DB 的 Doppler 项目中配置 `REDIS_URL` 环境变量：
- 格式：`redis://:password@host:port`
- Executor 通过 `TARGET_DB_DOPPLER_TOKEN` 自动获取此配置
- 系统会自动检测 Redis 可用性并选择模式

### Q: 如何验证运行时？

访问 `GET /` 查看响应中的 `runtime` 字段（`"Bun"` 或 `"Node.js"`）。

---

## 安全注意事项

- **绝不**在日志中输出数据库密码或敏感数据
- **必须**使用签名验证保护所有执行端点
- **必须**验证目标数据库在白名单中
- **建议**在生产环境使用 Doppler 管理敏感配置
