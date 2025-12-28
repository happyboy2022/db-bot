# 阶段五：Executor 服务

## 概述

本阶段实现 Executor 服务的核心功能：数据库连接池、SQL 执行端点和会话管理端点。

## 任务列表

### T-014: MySQL 连接池管理

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-003**
- **可并行：是**（独立模块）

#### 任务描述

实现 MySQL 连接池工厂，支持按目标懒加载连接池。

参考文档：[API 契约 - 数据库配置](../specs/api-contract.md#3-数据库配置)

#### 详细步骤

1. 创建配置读取器（`src/db/config.ts`）：
   ```typescript
   interface DbTarget {
     host: string;
     port: number;
     database: string;
     user: string;
     password: string;
   }

   interface DbConfig {
     [serviceId: string]: {
       polardb_mysql: {
         primary?: DbTarget;
         record?: DbTarget;
       };
     };
   }

   export function loadDbConfig(): DbConfig {
     // 方式一：从 JSON 环境变量读取
     if (process.env.SERVICE_DB_CONFIG_JSON) {
       return JSON.parse(process.env.SERVICE_DB_CONFIG_JSON);
     }

     // 方式二：从分项环境变量读取
     // US_EAST_1_POLARDB_PRIMARY_HOST 等
     // ...
   }

   export function getTargetConfig(
     serviceId: string,
     dbType: string,
     dbRole: string
   ): DbTarget | null {
     const config = loadDbConfig();
     return config[serviceId]?.[dbType]?.[dbRole] ?? null;
   }
   ```

2. 创建连接池工厂（`src/db/pool.ts`）：
   ```typescript
   import mysql from 'mysql2/promise';
   import { getTargetConfig } from './config';

   const pools = new Map<string, mysql.Pool>();

   export async function getPool(
     serviceId: string,
     dbType: string,
     dbRole: string
   ): Promise<mysql.Pool> {
     const key = `${serviceId}:${dbType}:${dbRole}`;

     if (pools.has(key)) {
       return pools.get(key)!;
     }

     const config = getTargetConfig(serviceId, dbType, dbRole);
     if (!config) {
       throw new Error(`Unknown target: ${key}`);
     }

     const pool = mysql.createPool({
       host: config.host,
       port: config.port,
       database: config.database,
       user: config.user,
       password: config.password,
       waitForConnections: true,
       connectionLimit: 5,
       queueLimit: 0,
       connectTimeout: 10000,
     });

     pools.set(key, pool);
     return pool;
   }
   ```

3. 创建白名单校验（`src/db/validator.ts`）：
   ```typescript
   export function isValidTarget(
     serviceId: string,
     dbType: string,
     dbRole: string
   ): boolean {
     const config = getTargetConfig(serviceId, dbType, dbRole);
     return config !== null;
   }
   ```

4. 创建健康检查（`src/db/health.ts`）：
   ```typescript
   export async function checkDbHealth(): Promise<ServiceStatus[]> {
     const config = loadDbConfig();
     const results: ServiceStatus[] = [];

     for (const [serviceId, types] of Object.entries(config)) {
       for (const [dbType, roles] of Object.entries(types)) {
         for (const [dbRole] of Object.entries(roles)) {
           try {
             const pool = await getPool(serviceId, dbType, dbRole);
             const start = Date.now();
             await pool.query('SELECT 1');
             results.push({
               serviceId,
               dbType,
               dbRole,
               available: true,
               latencyMs: Date.now() - start,
             });
           } catch {
             results.push({
               serviceId,
               dbType,
               dbRole,
               available: false,
             });
           }
         }
       }
     }

     return results;
   }
   ```

5. 更新 Health 端点以使用健康检查

#### 产出文件

- `apps/executor/src/db/config.ts`
- `apps/executor/src/db/pool.ts`
- `apps/executor/src/db/validator.ts`
- `apps/executor/src/db/health.ts`
- `apps/executor/src/db/index.ts`

#### 验收标准

- [x] 正确读取 JSON 配置
- [x] 正确读取分项配置
- [x] 连接池懒加载
- [x] 白名单校验正确
- [x] 健康检查返回正确状态

---

### T-015: Execute 端点

- [x] **状态：已完成**
- **优先级：P0**
- **依赖：T-009, T-014**
- **可并行：否**

#### 任务描述

实现 SQL 执行端点，包括二次校验、执行和结果返回。

参考文档：[API 契约 - Execute 端点](../specs/api-contract.md#21-post-apiv1execute)

#### 详细步骤

1. 创建执行服务（`src/services/executor.ts`）：
   ```typescript
   import { getPool } from '../db/pool';
   import { validateSql } from '@sql-ops/shared/validators';

   interface ExecuteOptions {
     serviceId: string;
     dbType: string;
     dbRole: string;
     sql: string;
     timeoutMs: number;
   }

   interface ExecuteResult {
     success: boolean;
     durationMs: number;
     processId?: number;
     result?: {
       type: 'select' | 'write';
       rows?: any[];
       columns?: string[];
       rowCount?: number;
       truncated?: boolean;
       affectedRows?: number;
     };
     error?: {
       code: string;
       message: string;
     };
   }

   export async function executeStatement(
     options: ExecuteOptions
   ): Promise<ExecuteResult> {
     const startTime = Date.now();

     // 1. 二次校验 SQL
     const validation = validateSql(options.sql);
     if (!validation.valid) {
       return {
         success: false,
         durationMs: Date.now() - startTime,
         error: {
           code: 'SQL_VALIDATION_FAILED',
           message: validation.errors.join('; '),
         },
       };
     }

     // 2. 获取连接
     const pool = await getPool(
       options.serviceId,
       options.dbType,
       options.dbRole
     );
     const connection = await pool.getConnection();

     try {
       // 3. 获取 process id
       const [idResult] = await connection.query('SELECT CONNECTION_ID() as id');
       const processId = (idResult as any[])[0].id;

       // 4. 设置超时
       await connection.query(
         `SET SESSION MAX_EXECUTION_TIME=${options.timeoutMs}`
       );

       // 5. 执行 SQL
       const [result, fields] = await connection.query(options.sql);

       // 6. 处理结果
       if (Array.isArray(result)) {
         // SELECT 结果
         const rows = result.slice(0, 200);
         return {
           success: true,
           durationMs: Date.now() - startTime,
           processId,
           result: {
             type: 'select',
             rows,
             columns: fields?.map((f: any) => f.name) ?? [],
             rowCount: result.length,
             truncated: result.length > 200,
           },
         };
       } else {
         // UPDATE/DELETE 结果
         return {
           success: true,
           durationMs: Date.now() - startTime,
           processId,
           result: {
             type: 'write',
             affectedRows: (result as any).affectedRows,
           },
         };
       }
     } catch (error: any) {
       return {
         success: false,
         durationMs: Date.now() - startTime,
         error: {
           code: error.code ?? 'QUERY_ERROR',
           message: error.message,
         },
       };
     } finally {
       connection.release();
     }
   }
   ```

2. 创建 Process ID 追踪器（`src/services/process-tracker.ts`）：
   ```typescript
   interface ProcessInfo {
     statementId: string;
     requestId: string;
     createdAt: number;
   }

   const processMap = new Map<number, ProcessInfo>();
   const CACHE_TTL = 10 * 60 * 1000; // 10 分钟

   export function trackProcess(
     processId: number,
     statementId: string,
     requestId: string
   ) {
     processMap.set(processId, {
       statementId,
       requestId,
       createdAt: Date.now(),
     });
   }

   export function getProcessInfo(processId: number): ProcessInfo | null {
     return processMap.get(processId) ?? null;
   }

   export function isSystemOwnedProcess(processId: number): boolean {
     return processMap.has(processId);
   }

   // 定期清理过期记录
   setInterval(() => {
     const now = Date.now();
     for (const [pid, info] of processMap) {
       if (now - info.createdAt > CACHE_TTL) {
         processMap.delete(pid);
       }
     }
   }, 60000);
   ```

3. 创建执行路由（`src/routes/execute.ts`）：
   ```typescript
   import { Hono } from 'hono';
   import { zValidator } from '@hono/zod-validator';
   import { executeRequestSchema } from '@sql-ops/shared/schemas';
   import { executeStatement } from '../services/executor';
   import { trackProcess } from '../services/process-tracker';
   import { isValidTarget } from '../db/validator';

   export const executeRouter = new Hono();

   executeRouter.post(
     '/',
     zValidator('json', executeRequestSchema),
     async (c) => {
       const body = await c.req.valid('json');

       // 验证目标白名单
       if (!isValidTarget(body.serviceId, body.dbType, body.dbRole)) {
         return c.json(
           {
             success: false,
             error: { code: 'UNKNOWN_TARGET', message: 'Unknown target' },
           },
           400
         );
       }

       // 执行
       const result = await executeStatement({
         serviceId: body.serviceId,
         dbType: body.dbType,
         dbRole: body.dbRole,
         sql: body.sql,
         timeoutMs: body.timeoutMs,
       });

       // 记录 process id
       if (result.processId) {
         trackProcess(result.processId, body.statementId, body.requestId);
       }

       return c.json(result);
     }
   );
   ```

4. 注册路由到主应用

#### 产出文件

- `apps/executor/src/services/executor.ts`
- `apps/executor/src/services/process-tracker.ts`
- `apps/executor/src/routes/execute.ts`

#### 验收标准

- [x] 执行前二次校验 SQL
- [x] 正确执行 SELECT 并返回结果
- [x] SELECT 结果限制 200 行
- [x] 正确执行 UPDATE/DELETE 并返回 affectedRows
- [x] 记录 process id
- [x] 超时正确处理
- [x] 错误正确返回

---

### T-016: Sessions 端点

- [x] **状态：已完成**
- **优先级：P1**
- **依赖：T-014**
- **可并行：是**（可与 T-015 并行）

#### 任务描述

实现会话列表和 kill 会话端点。

参考文档：
- [API 契约 - Sessions 端点](../specs/api-contract.md#22-get-apiv1sessions)
- [API 契约 - Kill 端点](../specs/api-contract.md#23-post-apiv1sessionskill)

#### 详细步骤

1. 创建会话服务（`src/services/sessions.ts`）：
   ```typescript
   import { getPool } from '../db/pool';
   import { isSystemOwnedProcess } from './process-tracker';

   export interface Session {
     id: number;
     user: string;
     host: string;
     db: string | null;
     command: string;
     time: number;
     state: string | null;
     info: string | null;
     isSystemOwned: boolean;
   }

   export async function getSessions(
     serviceId: string,
     dbType: string,
     dbRole: string
   ): Promise<Session[]> {
     const pool = await getPool(serviceId, dbType, dbRole);
     const [rows] = await pool.query(`
       SELECT
         ID as id,
         USER as user,
         HOST as host,
         DB as db,
         COMMAND as command,
         TIME as time,
         STATE as state,
         SUBSTRING(INFO, 1, 200) as info
       FROM information_schema.PROCESSLIST
     `);

     return (rows as any[]).map((row) => ({
       ...row,
       isSystemOwned: isSystemOwnedProcess(row.id),
     }));
   }

   export async function killSession(
     serviceId: string,
     dbType: string,
     dbRole: string,
     processId: number
   ): Promise<{ success: boolean; error?: string }> {
     // 检查是否是系统创建的会话
     if (!isSystemOwnedProcess(processId)) {
       return {
         success: false,
         error: 'FORBIDDEN_KILL_EXTERNAL',
       };
     }

     const pool = await getPool(serviceId, dbType, dbRole);
     try {
       await pool.query('KILL ?', [processId]);
       return { success: true };
     } catch (error: any) {
       return {
         success: false,
         error: error.message,
       };
     }
   }
   ```

2. 创建会话路由（`src/routes/sessions.ts`）：
   ```typescript
   import { Hono } from 'hono';
   import { zValidator } from '@hono/zod-validator';
   import { z } from 'zod';
   import { getSessions, killSession } from '../services/sessions';
   import { isValidTarget } from '../db/validator';

   export const sessionsRouter = new Hono();

   const querySchema = z.object({
     serviceId: z.string(),
     dbRole: z.enum(['primary', 'record']),
   });

   const killSchema = z.object({
     serviceId: z.string(),
     dbRole: z.enum(['primary', 'record']),
     processId: z.number().int().positive(),
     reason: z.string().min(1),
   });

   // GET /api/v1/sessions
   sessionsRouter.get('/', async (c) => {
     const { serviceId, dbRole } = c.req.query();

     if (!serviceId || !dbRole) {
       return c.json({ error: 'Missing parameters' }, 400);
     }

     if (!isValidTarget(serviceId, 'polardb_mysql', dbRole)) {
       return c.json({ error: 'Unknown target' }, 400);
     }

     const sessions = await getSessions(serviceId, 'polardb_mysql', dbRole);
     return c.json({ sessions });
   });

   // POST /api/v1/sessions/kill
   sessionsRouter.post('/kill', zValidator('json', killSchema), async (c) => {
     const body = await c.req.valid('json');

     if (!isValidTarget(body.serviceId, 'polardb_mysql', body.dbRole)) {
       return c.json({ error: 'Unknown target' }, 400);
     }

     const result = await killSession(
       body.serviceId,
       'polardb_mysql',
       body.dbRole,
       body.processId
     );

     if (!result.success) {
       if (result.error === 'FORBIDDEN_KILL_EXTERNAL') {
         return c.json(
           {
             success: false,
             error: {
               code: 'FORBIDDEN_KILL_EXTERNAL',
               message: 'Cannot kill sessions not created by this system',
             },
           },
           403
         );
       }
       return c.json(
         {
           success: false,
           error: { code: 'KILL_FAILED', message: result.error },
         },
         500
       );
     }

     return c.json({ success: true, killedProcessId: body.processId });
   });
   ```

3. 注册路由到主应用

#### 产出文件

- `apps/executor/src/services/sessions.ts`
- `apps/executor/src/routes/sessions.ts`

#### 验收标准

- [x] 正确返回 processlist
- [x] 标记 isSystemOwned
- [x] 只能 kill 系统创建的会话
- [x] kill 非系统会话返回 FORBIDDEN_KILL_EXTERNAL
- [x] kill 成功返回被 kill 的 processId
