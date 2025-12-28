# 多集群部署配置规范

## 架构概述

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              GitHub Actions                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐               │
│  │ DOPPLER_TOKEN_   │  │ DOPPLER_TOKEN_   │  │ DOPPLER_TOKEN_   │               │
│  │ US_1             │  │ US_2             │  │ SG_1             │  ...          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘               │
│           │                     │                     │                          │
│           ▼                     ▼                     ▼                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                    Doppler: sql-ops-executor 项目                        │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │    │
│  │  │ prd_us_1    │  │ prd_us_2    │  │ prd_sg_1    │  │ prd_sg_2    │     │    │
│  │  │ 环境        │  │ 环境        │  │ 环境        │  │ 环境        │     │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│           │                     │                     │                          │
│           ▼                     ▼                     ▼                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                  │
│  │ 阿里云函数计算   │  │ 阿里云函数计算   │  │ 阿里云函数计算   │                  │
│  │ sql-ops-executor│  │ sql-ops-executor│  │ sql-ops-executor│                  │
│  │ (us-east-1)     │  │ (us-west-2)     │  │ (ap-southeast-1)│                  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘                  │
└───────────┼─────────────────────┼─────────────────────┼──────────────────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │ PolarDB MySQL   │  │ PolarDB MySQL   │  │ PolarDB MySQL   │
   │ (US 1)          │  │ (US 2)          │  │ (SG 1)          │
   └─────────────────┘  └─────────────────┘  └─────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              Console (Vercel)                                    │
│                                                                                  │
│  执行 SQL 时：                                                                   │
│  1. 从 clusters 表获取集群的加密 Doppler Token                                   │
│  2. 解密 Token，调用 Doppler API 获取 EXECUTOR_URL（带缓存）                     │
│  3. 生成签名请求（timestamp + nonce + trace_id + HMAC-SHA256）                   │
│  4. 调用对应集群的 Executor API 执行 SQL                                         │
│                                                                                  │
│  Executor 验证：                                                                 │
│  1. 验证 timestamp 在有效窗口内（±5分钟）                                        │
│  2. 验证 nonce 未被使用过（防回放）                                              │
│  3. 验证 HMAC-SHA256 签名                                                        │
│  4. 记录 trace_id 用于日志追踪                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Doppler 项目结构

### 推荐的 Doppler 组织结构

使用**单项目多环境**模式，每个环境代表一个集群：

```
Doppler Organization
│
├── sql-ops-console (项目)
│   ├── dev (环境) - Console 开发环境
│   └── prd (环境) - Console 生产环境
│
└── sql-ops-executor (项目)
    ├── dev (环境) - 本地开发环境
    ├── prd_us_1 (环境) - US 区域集群 1
    ├── prd_us_2 (环境) - US 区域集群 2
    ├── prd_sg_1 (环境) - SG 区域集群 1
    └── prd_sg_2 (环境) - SG 区域集群 2
```

### 环境命名规范

- 格式：`{stage}_{cluster_name}`
- 示例：`prd_us_1`, `prd_us_2`, `prd_sg_1`, `prd_sg_2`
- 开发环境：`dev`

---

## 2. 集群命名规范

### 集群名称 (Cluster Name)

- 使用小写字母和下划线
- 格式：`{区域缩写}_{编号}`
- 示例：`us_1`, `us_2`, `sg_1`, `sg_2`, `jp_1`

### Doppler Token Secret 命名

- 格式：`DOPPLER_TOKEN_{CLUSTER_NAME_UPPER}`
- 示例：`DOPPLER_TOKEN_US_1`, `DOPPLER_TOKEN_SG_1`

### 函数计算函数名

- **统一函数名**：`sql-ops-executor`（所有集群使用相同函数名）
- 通过部署到不同区域实现隔离

---

## 3. Doppler 配置详情

### 3.1 Console 项目 (sql-ops-console)

| 环境变量 | 说明 | 示例值 |
|---------|------|--------|
| `DATABASE_URL` | Neon PostgreSQL 连接字符串 | `postgresql://...` |
| `BETTER_AUTH_SECRET` | Better Auth 会话签名密钥 | `openssl rand -base64 32` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | 信任的来源（CORS） | `https://console.example.com` |
| `DOPPLER_TOKEN_ENCRYPTION_KEY` | Doppler Token 加密密钥 (64位十六进制) | `a1b2c3...` |
| `EXECUTOR_SIGNING_SECRET` | Executor 请求签名密钥 (64位十六进制) | `d4e5f6...` |

### 3.2 Executor 项目 (sql-ops-executor)

每个集群环境（如 `prd_us_1`）需要配置以下环境变量：

#### 部署相关 (GitHub Actions 使用)

| 环境变量 | 说明 | 示例值 |
|---------|------|--------|
| `ALICLOUD_ACCESS_KEY_ID` | 阿里云 AccessKey ID | `LTAI5t...` |
| `ALICLOUD_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret | `xxx...` |
| `ALICLOUD_REGION` | 阿里云区域 | `us-east-1` |

#### 运行时相关 (Executor 服务使用)

| 环境变量 | 说明 | 示例值 |
|---------|------|--------|
| `CLUSTER_NAME` | 集群名称 | `us_1` |
| `EXECUTOR_URL` | 部署后的 Executor URL | `https://xxx.fc.aliyuncs.com/...` |
| `EXECUTOR_SIGNING_SECRET` | 请求签名验证密钥 (与 Console 相同) | `d4e5f6...` |
| `SERVICE_DB_CONFIG_JSON` | 数据库连接配置 | 见下方 JSON |

#### SERVICE_DB_CONFIG_JSON 示例

```json
{
  "us_1": {
    "polardb_mysql": {
      "primary": {
        "host": "pc-xxx.rwlb.us-east-1.rds.aliyuncs.com",
        "port": 3306,
        "database": "myapp",
        "user": "admin",
        "password": "xxx"
      },
      "readonly": {
        "host": "pc-xxx.ro.us-east-1.rds.aliyuncs.com",
        "port": 3306,
        "database": "myapp",
        "user": "readonly",
        "password": "xxx"
      }
    }
  }
}
```

---

## 4. GitHub Actions Secret 配置

GitHub Actions **只需要配置各集群的 Doppler Service Token**。

### 必需的 Secrets

| Secret 名称 | 说明 |
|------------|------|
| `DOPPLER_TOKEN_CONSOLE` | Console 项目 prd 环境的 Service Token |
| `DOPPLER_TOKEN_US_1` | Executor 项目 prd_us_1 环境的 Service Token |
| `DOPPLER_TOKEN_US_2` | Executor 项目 prd_us_2 环境的 Service Token |
| `DOPPLER_TOKEN_SG_1` | Executor 项目 prd_sg_1 环境的 Service Token |
| `DOPPLER_TOKEN_SG_2` | Executor 项目 prd_sg_2 环境的 Service Token |

### 可选的 Secrets (用于 Vercel 部署)

| Secret 名称 | 说明 |
|------------|------|
| `VERCEL_TOKEN` | Vercel 部署 Token |
| `VERCEL_ORG_ID` | Vercel 组织 ID |
| `VERCEL_PROJECT_ID` | Vercel 项目 ID |

---

## 5. 通信安全策略

### 5.1 请求签名机制

Console 和 Executor 之间的通信采用 **HMAC-SHA256 签名 + 时间戳 + Nonce** 防止回放攻击。

#### 请求头结构

```
X-Trace-ID: <UUID v4>           # 请求追踪 ID
X-Timestamp: <Unix timestamp>   # 请求时间戳（毫秒）
X-Nonce: <UUID v4>              # 一次性随机数
X-Signature: <HMAC-SHA256>      # 请求签名
```

#### 签名算法

```typescript
// Console 端生成签名
function generateSignature(
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  body: string,
  secret: string
): string {
  const payload = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}`;
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

// 请求示例
const timestamp = Date.now();
const nonce = crypto.randomUUID();
const traceId = crypto.randomUUID();
const body = JSON.stringify({ clusterId: 'us_1', sql: '...' });

const signature = generateSignature(
  'POST',
  '/api/v1/execute',
  timestamp,
  nonce,
  body,
  EXECUTOR_SIGNING_SECRET
);

fetch(executorUrl + '/api/v1/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Trace-ID': traceId,
    'X-Timestamp': timestamp.toString(),
    'X-Nonce': nonce,
    'X-Signature': signature,
  },
  body,
});
```

#### Executor 端验证

```typescript
// Executor 端验证签名
async function verifyRequest(req: Request): Promise<boolean> {
  const timestamp = parseInt(req.headers.get('X-Timestamp') || '0');
  const nonce = req.headers.get('X-Nonce');
  const signature = req.headers.get('X-Signature');
  const traceId = req.headers.get('X-Trace-ID');

  // 1. 验证时间戳（±5分钟有效窗口）
  const now = Date.now();
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
    return false; // 时间戳过期
  }

  // 2. 验证 nonce 未被使用（使用 Redis 或内存缓存）
  if (await isNonceUsed(nonce)) {
    return false; // 重放攻击
  }
  await markNonceUsed(nonce, 10 * 60); // 10分钟过期

  // 3. 验证签名
  const body = await req.text();
  const expectedSignature = generateSignature(
    req.method,
    new URL(req.url).pathname,
    timestamp,
    nonce,
    body,
    EXECUTOR_SIGNING_SECRET
  );

  if (signature !== expectedSignature) {
    return false; // 签名无效
  }

  // 4. 记录 trace_id 用于日志追踪
  logger.info('Request verified', { traceId, nonce });

  return true;
}
```

### 5.2 Nonce 存储策略

由于 Executor 部署在函数计算上，建议使用以下方式存储 Nonce：

1. **内存 + LRU 缓存**（简单场景）
   - 使用 LRU 缓存存储最近 10 分钟的 nonce
   - 适合单实例或低并发场景

2. **Redis**（推荐）
   - 使用 Redis SET with TTL 存储 nonce
   - 适合多实例、高并发场景

3. **数据库**（备选）
   - 使用数据库表存储 nonce
   - 定期清理过期记录

### 5.3 日志追踪

所有请求和响应都应包含 `trace_id`：

```typescript
// Console 端
const traceId = crypto.randomUUID();
logger.info('Sending request to executor', { traceId, clusterId, sql });

// Executor 端
logger.info('Processing request', { traceId, clusterId });
logger.info('Request completed', { traceId, durationMs, success });

// 响应头返回 trace_id
response.headers.set('X-Trace-ID', traceId);
```

---

## 6. Doppler API 缓存策略

### 6.1 缓存实现

```typescript
interface CachedConfig {
  executorUrl: string;
  signingSecret: string;
  fetchedAt: number;
}

// 内存缓存，TTL 5 分钟
const configCache = new Map<string, CachedConfig>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function getExecutorConfig(clusterId: string): Promise<CachedConfig> {
  const cacheKey = `executor:${clusterId}`;
  const cached = configCache.get(cacheKey);

  // 检查缓存是否有效
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }

  // 从数据库获取集群信息
  const cluster = await getClusterById(clusterId);
  if (!cluster?.dopplerTokenEncrypted) {
    throw new Error(`Cluster ${clusterId} not found or not configured`);
  }

  // 解密 Doppler Token
  const dopplerToken = decryptDopplerToken(cluster.dopplerTokenEncrypted);

  // 从 Doppler 获取配置
  const secrets = await fetchDopplerSecrets(dopplerToken);

  const config: CachedConfig = {
    executorUrl: secrets.EXECUTOR_URL,
    signingSecret: secrets.EXECUTOR_SIGNING_SECRET,
    fetchedAt: Date.now(),
  };

  // 更新缓存
  configCache.set(cacheKey, config);

  return config;
}
```

### 6.2 缓存失效策略

1. **TTL 过期**：5 分钟自动过期
2. **主动失效**：更新集群配置时清除缓存
3. **错误重试**：API 调用失败时清除缓存并重试

```typescript
// 主动清除缓存
function clearExecutorConfigCache(clusterId?: string): void {
  if (clusterId) {
    configCache.delete(`executor:${clusterId}`);
  } else {
    configCache.clear();
  }
}

// 更新集群时清除缓存
async function updateCluster(clusterId: string, data: ClusterUpdate) {
  await db.update(clusters).set(data).where(eq(clusters.id, clusterId));
  clearExecutorConfigCache(clusterId);
}
```

---

## 7. 部署流程

### 7.1 新增集群部署流程

1. **在 Doppler 中创建环境**
   ```
   项目: sql-ops-executor
   新环境: prd_{cluster_name}  (如: prd_us_1)
   ```

2. **配置环境变量**
   - `ALICLOUD_ACCESS_KEY_ID`
   - `ALICLOUD_ACCESS_KEY_SECRET`
   - `ALICLOUD_REGION`
   - `CLUSTER_NAME`
   - `EXECUTOR_SIGNING_SECRET`（与 Console 相同）
   - `SERVICE_DB_CONFIG_JSON`

3. **生成 Doppler Service Token**
   - 在 Doppler Dashboard 中为该环境生成 Service Token

4. **添加 GitHub Secret**
   ```
   Secret Name: DOPPLER_TOKEN_{CLUSTER_NAME_UPPER}
   Value: dp.st.xxx...
   ```

5. **在 Console 中添加集群**
   - 进入 "集群管理"
   - 添加新集群，填入 Doppler Service Token

6. **触发部署**
   ```bash
   gh workflow run executor-multi-cluster.yml -f clusters=us_1
   ```

### 7.2 GitHub Actions 工作流

```yaml
name: Executor Multi-Cluster Deploy

on:
  workflow_dispatch:
    inputs:
      clusters:
        description: '部署的集群 (逗号分隔，留空则部署所有)'
        required: false
        default: ''

env:
  ALL_CLUSTERS: 'us_1,us_2,sg_1,sg_2'
  FC_FUNCTION_NAME: 'sql-ops-executor'  # 统一函数名

jobs:
  deploy:
    strategy:
      fail-fast: false
      matrix:
        cluster: ${{ fromJson(needs.prepare.outputs.clusters) }}
    steps:
      - name: Fetch secrets from Doppler
        run: |
          CLUSTER_UPPER=$(echo "${{ matrix.cluster }}" | tr '[:lower:]' '[:upper:]')
          DOPPLER_TOKEN="${!DOPPLER_TOKEN_VAR}"

          SECRETS=$(curl -s -H "Authorization: Bearer $DOPPLER_TOKEN" \
            "https://api.doppler.com/v3/configs/config/secrets/download?format=json")

          echo "ALICLOUD_REGION=$(echo $SECRETS | jq -r '.ALICLOUD_REGION')" >> $GITHUB_OUTPUT
        env:
          DOPPLER_TOKEN_US_1: ${{ secrets.DOPPLER_TOKEN_US_1 }}
          DOPPLER_TOKEN_US_2: ${{ secrets.DOPPLER_TOKEN_US_2 }}
          DOPPLER_TOKEN_SG_1: ${{ secrets.DOPPLER_TOKEN_SG_1 }}
          DOPPLER_TOKEN_SG_2: ${{ secrets.DOPPLER_TOKEN_SG_2 }}

      - name: Deploy to Aliyun FC
        run: |
          cd apps/executor
          s deploy -y
```

---

## 8. 环境变量汇总

### Console 环境变量

| 变量名 | 存储位置 | 说明 |
|--------|---------|------|
| `DATABASE_URL` | Doppler (sql-ops-console/prd) | Neon PostgreSQL 连接串 |
| `BETTER_AUTH_SECRET` | Doppler (sql-ops-console/prd) | Better Auth 会话签名密钥 |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Doppler (sql-ops-console/prd) | 信任的来源（CORS） |
| `DOPPLER_TOKEN_ENCRYPTION_KEY` | Doppler (sql-ops-console/prd) | Doppler Token 加密密钥 |
| `EXECUTOR_SIGNING_SECRET` | Doppler (sql-ops-console/prd) | 请求签名密钥 |

### Executor 环境变量 (每个集群环境)

| 变量名 | 存储位置 | 用途 |
|--------|---------|------|
| `ALICLOUD_ACCESS_KEY_ID` | Doppler (sql-ops-executor/prd_*) | 部署 |
| `ALICLOUD_ACCESS_KEY_SECRET` | Doppler (sql-ops-executor/prd_*) | 部署 |
| `ALICLOUD_REGION` | Doppler (sql-ops-executor/prd_*) | 部署 |
| `CLUSTER_NAME` | Doppler (sql-ops-executor/prd_*) | 运行时 |
| `EXECUTOR_URL` | Doppler (sql-ops-executor/prd_*) | Console 调用 |
| `EXECUTOR_SIGNING_SECRET` | Doppler (sql-ops-executor/prd_*) | 签名验证 |
| `SERVICE_DB_CONFIG_JSON` | Doppler (sql-ops-executor/prd_*) | 运行时 |

### GitHub Actions Secrets

| Secret 名称 | 说明 |
|------------|------|
| `DOPPLER_TOKEN_CONSOLE` | sql-ops-console/prd 环境的 Service Token |
| `DOPPLER_TOKEN_US_1` | sql-ops-executor/prd_us_1 环境的 Service Token |
| `DOPPLER_TOKEN_US_2` | sql-ops-executor/prd_us_2 环境的 Service Token |
| `DOPPLER_TOKEN_SG_1` | sql-ops-executor/prd_sg_1 环境的 Service Token |
| `DOPPLER_TOKEN_SG_2` | sql-ops-executor/prd_sg_2 环境的 Service Token |

---

## 9. 安全最佳实践

1. **通信安全**
   - 所有请求必须携带有效签名
   - 时间戳有效窗口 ±5 分钟
   - Nonce 防重放，10 分钟内不可重复使用

2. **密钥管理**
   - `EXECUTOR_SIGNING_SECRET` 必须足够长（64 位十六进制）
   - 定期轮换签名密钥
   - 轮换时需同时更新 Console 和所有 Executor

3. **日志追踪**
   - 所有请求必须携带 `trace_id`
   - 日志中记录完整的请求链路
   - 敏感信息（SQL、密码）脱敏处理

4. **网络隔离**
   - Executor 部署在 VPC 内
   - 数据库仅允许 VPC 内访问
   - 启用 HTTPS

---

## 10. 故障排查

### 常见问题

1. **签名验证失败**
   - 检查 `EXECUTOR_SIGNING_SECRET` 是否一致
   - 检查时间戳是否在有效窗口内
   - 检查服务器时钟是否同步

2. **Nonce 重复错误**
   - 检查客户端是否正确生成新的 nonce
   - 检查 nonce 缓存是否正常工作

3. **Doppler API 超时**
   - 检查网络连接
   - 检查缓存是否正常工作
   - 考虑增加缓存 TTL

### 调试命令

```bash
# 验证 Doppler Token
curl -H "Authorization: Bearer $DOPPLER_TOKEN" \
  "https://api.doppler.com/v3/configs/config/secrets/download?format=json"

# 测试签名生成
node -e "
const crypto = require('crypto');
const payload = 'POST\n/api/v1/execute\n${Date.now()}\n$(uuidgen)\n{}';
const sig = crypto.createHmac('sha256', '$SECRET').update(payload).digest('hex');
console.log(sig);
"

# 检查 Executor 健康状态（带签名）
curl -X GET "$EXECUTOR_URL/api/v1/health" \
  -H "X-Timestamp: $(date +%s)000" \
  -H "X-Nonce: $(uuidgen)" \
  -H "X-Trace-ID: $(uuidgen)" \
  -H "X-Signature: $SIGNATURE"
```
