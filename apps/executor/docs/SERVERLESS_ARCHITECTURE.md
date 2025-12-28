# Serverless 架构分析与改进方案

## 当前问题分析

### 1. 连接池问题

**现状**：使用 `mysql2` 的连接池，配置如下：
```typescript
const POOL_CONFIG = {
  connectionLimit: 5,
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
};
```

**Serverless 环境中的问题**：
- 函数计算实例可能随时被销毁和重建
- 连接池状态无法在实例间共享
- 冷启动时需要重新建立连接
- `enableKeepAlive` 在短生命周期实例中意义不大
- 可能导致数据库连接数过多（每个实例都创建自己的连接池）

### 2. 进程 ID 跟踪问题

**现状**：使用内存 Map 存储进程 ID：
```typescript
const processMap = new Map<number, ProcessInfo>();
```

**Serverless 环境中的问题**：
- 进程信息在实例销毁后丢失
- 无法跨实例查询进程状态
- Kill 请求可能路由到不知道该进程的实例
- 无法准确识别"系统拥有"的进程

### 3. Nonce 缓存问题

**现状**：使用内存缓存防止请求重放：
```typescript
const nonceCache = new Map<string, number>();
```

**Serverless 环境中的问题**：
- 不同实例无法共享 nonce 状态
- 同一 nonce 可能被接受多次（如果路由到不同实例）
- 安全风险：重放攻击可能成功

---

## 解决方案评估

### 方案一：连接池优化

#### 选项 A：每请求单连接（推荐用于 Serverless）

```typescript
// 不使用连接池，每次请求创建单独连接
export async function getConnection(
  clusterId: string,
  dbType: string,
  code: string
): Promise<mysql.Connection> {
  const config = getTargetConfig(clusterId, dbType, code);
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectTimeout: 5000,
  });
}
```

**优点**：
- 简单可靠，无状态
- 不会有连接泄漏
- 每个请求独立

**缺点**：
- 每次请求都有连接开销（约 50-100ms）
- 对于高并发场景可能不够高效

#### 选项 B：短生命周期连接池

```typescript
const SERVERLESS_POOL_CONFIG = {
  connectionLimit: 1,        // 最小连接数
  idleTimeout: 10000,        // 10 秒空闲超时
  maxIdle: 1,                // 最大空闲连接
  enableKeepAlive: false,    // 禁用 Keep-Alive
  connectTimeout: 5000,
};
```

**优点**：
- 复用连接减少开销
- 控制资源使用

**缺点**：
- 仍有连接状态问题
- 需要处理连接失效

#### 选项 C：使用 Drizzle ORM + mysql2

Drizzle ORM 本身不解决连接池问题，它使用底层驱动（mysql2）的连接管理。但它提供了更好的 TypeScript 支持和更简洁的 API。

```typescript
import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';

// Drizzle 配置
const connection = await mysql.createConnection({...});
const db = drizzle(connection);

// 使用 Drizzle 查询
const result = await db.execute(sql`SELECT * FROM users`);
```

**优点**：
- 更好的 TypeScript 支持
- 类型安全的 SQL 构建
- 清晰的 API

**缺点**：
- 不解决 Serverless 连接管理问题
- 需要迁移现有代码
- 增加依赖和包大小

### 推荐方案：选项 A + 连接缓存

```typescript
// 在函数实例生命周期内缓存连接
let cachedConnection: mysql.Connection | null = null;
let lastActivity = 0;
const CONNECTION_IDLE_TIMEOUT = 30000; // 30 秒

export async function getConnection(config: DbTarget): Promise<mysql.Connection> {
  const now = Date.now();

  // 如果连接存在且未超时，复用
  if (cachedConnection && now - lastActivity < CONNECTION_IDLE_TIMEOUT) {
    try {
      await cachedConnection.ping();
      lastActivity = now;
      return cachedConnection;
    } catch {
      // 连接已断开，重新创建
      await cachedConnection.end().catch(() => {});
      cachedConnection = null;
    }
  }

  // 创建新连接
  cachedConnection = await mysql.createConnection({...config});
  lastActivity = now;
  return cachedConnection;
}
```

---

### 方案二：Redis 进程跟踪

使用目标库的 Redis 存储进程状态，实现跨实例的进程跟踪。

#### 数据结构设计

```
# 进程信息 Hash
process:{clusterId}:{processId}
  - statementId: string
  - requestId: string
  - dbType: string
  - code: string
  - startTime: number
  - sql: string (前 200 字符)
  - status: "running" | "completed" | "killed"

# 进程列表 Sorted Set (按开始时间排序)
processes:{clusterId}:{dbType}:{code}
  - score: startTime
  - member: processId

# TTL: 自动过期（与最大执行时间 + 缓冲对齐）
```

#### 接口设计

```typescript
interface ProcessTracker {
  // 记录新进程
  trackProcess(info: {
    clusterId: string;
    dbType: string;
    code: string;
    processId: number;
    statementId: string;
    requestId: string;
    sql: string;
    timeoutMs: number;
  }): Promise<void>;

  // 获取进程信息
  getProcess(
    clusterId: string,
    processId: number
  ): Promise<ProcessInfo | null>;

  // 列出活跃进程
  listProcesses(
    clusterId: string,
    dbType: string,
    code: string
  ): Promise<ProcessInfo[]>;

  // 标记进程完成
  completeProcess(
    clusterId: string,
    processId: number
  ): Promise<void>;

  // 标记进程被杀
  killProcess(
    clusterId: string,
    processId: number,
    reason: string
  ): Promise<void>;

  // 判断是否系统进程
  isSystemProcess(
    clusterId: string,
    processId: number
  ): Promise<boolean>;
}
```

#### 实现示例

```typescript
import Redis from 'ioredis';

export class RedisProcessTracker implements ProcessTracker {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async trackProcess(info: ProcessTrackInfo): Promise<void> {
    const key = `process:${info.clusterId}:${info.processId}`;
    const listKey = `processes:${info.clusterId}:${info.dbType}:${info.code}`;

    // TTL = 超时时间 + 5 分钟缓冲
    const ttl = Math.ceil((info.timeoutMs + 5 * 60 * 1000) / 1000);

    const pipeline = this.redis.pipeline();

    // 存储进程信息
    pipeline.hset(key, {
      statementId: info.statementId,
      requestId: info.requestId,
      dbType: info.dbType,
      code: info.code,
      startTime: Date.now(),
      sql: info.sql.substring(0, 200),
      status: 'running',
    });
    pipeline.expire(key, ttl);

    // 添加到进程列表
    pipeline.zadd(listKey, Date.now(), info.processId.toString());
    pipeline.expire(listKey, ttl);

    await pipeline.exec();
  }

  async getProcess(clusterId: string, processId: number): Promise<ProcessInfo | null> {
    const key = `process:${clusterId}:${processId}`;
    const data = await this.redis.hgetall(key);

    if (!Object.keys(data).length) {
      return null;
    }

    return {
      processId,
      statementId: data.statementId,
      requestId: data.requestId,
      dbType: data.dbType,
      code: data.code,
      startTime: parseInt(data.startTime),
      sql: data.sql,
      status: data.status as 'running' | 'completed' | 'killed',
    };
  }

  async isSystemProcess(clusterId: string, processId: number): Promise<boolean> {
    const key = `process:${clusterId}:${processId}`;
    return (await this.redis.exists(key)) === 1;
  }

  async completeProcess(clusterId: string, processId: number): Promise<void> {
    const key = `process:${clusterId}:${processId}`;
    await this.redis.hset(key, 'status', 'completed');
    // 设置较短 TTL 用于历史记录
    await this.redis.expire(key, 60);
  }

  async killProcess(
    clusterId: string,
    processId: number,
    reason: string
  ): Promise<void> {
    const key = `process:${clusterId}:${processId}`;
    await this.redis.hset(key, {
      status: 'killed',
      killReason: reason,
      killedAt: Date.now(),
    });
  }
}
```

---

### 方案三：Nonce 防重放改进

使用 Redis 存储 nonce，实现跨实例的防重放保护。

```typescript
export class RedisNonceValidator {
  private redis: Redis;
  private prefix = 'nonce:';
  private ttl = 10 * 60; // 10 分钟

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async isNonceUsed(nonce: string): Promise<boolean> {
    const key = this.prefix + nonce;
    // SETNX 返回 1 表示新设置，0 表示已存在
    const result = await this.redis.setnx(key, '1');

    if (result === 1) {
      // 新 nonce，设置过期时间
      await this.redis.expire(key, this.ttl);
      return false;
    }

    // nonce 已存在
    return true;
  }
}
```

---

## Drizzle ORM 评估

### 优势

1. **类型安全**：完整的 TypeScript 类型推断
2. **轻量级**：比 Prisma 更轻，适合 Serverless
3. **SQL 透明**：可以看到生成的 SQL
4. **灵活性**：支持原始 SQL 和 ORM 模式混用

### 劣势

1. **迁移成本**：需要重写现有查询代码
2. **不解决连接问题**：底层仍使用 mysql2
3. **学习曲线**：团队需要学习新 API
4. **功能限制**：动态 SQL 场景（如用户输入的 SQL）不适合 ORM

### 结论

**不建议迁移到 Drizzle ORM**，原因：
1. Executor 主要执行用户提交的原始 SQL，不是应用层 ORM 场景
2. 迁移成本高，收益有限
3. 不解决 Serverless 连接管理的核心问题

---

## 推荐实施方案

### 阶段一：Redis 进程跟踪（高优先级）

1. 添加 `ioredis` 依赖
2. 实现 `RedisProcessTracker` 类
3. 修改 `executeStatement` 使用 Redis 跟踪
4. 修改 `sessions` 路由使用 Redis 查询
5. 实现进程完成/超时的状态更新

### 阶段二：Nonce 防重放改进（中优先级）

1. 实现 `RedisNonceValidator` 类
2. 修改 `signingMiddleware` 使用 Redis
3. 保留内存缓存作为降级方案

### 阶段三：连接管理优化（低优先级）

1. 评估当前连接池在 FC 中的表现
2. 如有问题，迁移到单连接 + 缓存模式
3. 添加连接健康检查

---

## Redis 配置

### 目标库 Redis 连接

从 Doppler 获取 Redis URL：
```
REDIS_URL=redis://:password@host:6379
```

### 连接管理

```typescript
import Redis from 'ioredis';

let redisClient: Redis | null = null;

export async function getRedisClient(): Promise<Redis> {
  if (redisClient) {
    return redisClient;
  }

  const config = await getTargetDbConfig();
  if (!config.redisUrl) {
    throw new Error('Redis URL not configured');
  }

  redisClient = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    connectTimeout: 5000,
    lazyConnect: true,
  });

  await redisClient.connect();
  return redisClient;
}
```

---

## 流程图

### SQL 执行流程（改进后）

```
┌──────────────────────────────────────────────────────────────────┐
│                         Console                                   │
└──────────────────────────────────────────────────────────────────┘
                                │
                                │ POST /api/v1/execute
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Executor (FC)                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. 验证签名 (Redis nonce 检查)                                    │
│                                                                   │
│  2. 获取 MySQL 连接                                                │
│                                                                   │
│  3. 获取 CONNECTION_ID()                                          │
│         │                                                         │
│         ▼                                                         │
│  4. 写入 Redis: process:{clusterId}:{processId}                   │
│         │                                                         │
│         ▼                                                         │
│  5. 执行 SQL                                                       │
│         │                                                         │
│         ├─── 成功 ──▶ 更新 Redis: status=completed                │
│         │                                                         │
│         └─── 失败/超时 ──▶ 更新 Redis: status=failed              │
│                                                                   │
│  6. 释放连接，返回结果                                             │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 进程终止流程

```
┌──────────────────────────────────────────────────────────────────┐
│                         Console                                   │
│                                                                   │
│  用户发现执行时间过长，点击"终止"按钮                               │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
                                │
                                │ POST /api/v1/sessions/kill
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│                        Executor (FC)                              │
│                     (可能是不同实例)                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. 验证签名                                                       │
│                                                                   │
│  2. 从 Redis 获取进程信息                                          │
│     GET process:{clusterId}:{processId}                           │
│         │                                                         │
│         ├─── 存在且 status=running ──▶ 继续                       │
│         │                                                         │
│         └─── 不存在或已完成 ──▶ 返回相应状态                       │
│                                                                   │
│  3. 获取 MySQL 连接                                                │
│                                                                   │
│  4. 执行 KILL {processId}                                         │
│                                                                   │
│  5. 更新 Redis: status=killed, killReason=xxx                     │
│                                                                   │
│  6. 返回结果                                                       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 预期收益

1. **可靠的进程跟踪**：跨实例查询和终止进程
2. **安全的请求验证**：防止重放攻击
3. **更好的可观测性**：通过 Redis 查看活跃进程
4. **无状态服务**：完全适配 Serverless 环境
