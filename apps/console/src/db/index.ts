import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function getConnectionString(): string {
  // 支持 DATABASE_URL 或 POSTGRES_URL
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL or POSTGRES_URL environment variable is not set. ' +
      'Please configure one of them in your environment variables or .env file. ' +
      'For Neon/Vercel Postgres, use the pooled connection string from the dashboard.'
    );
  }

  // Validate connection string format
  if (!connectionString.startsWith('postgresql://') && !connectionString.startsWith('postgres://')) {
    const envVarName = process.env.DATABASE_URL ? 'DATABASE_URL' : 'POSTGRES_URL';
    throw new Error(
      `Invalid ${envVarName} format. Expected postgresql:// or postgres://, got: ${connectionString.substring(0, 20)}...`
    );
  }

  // Warn if connecting to localhost in production
  if (process.env.NODE_ENV === 'production') {
    try {
      const url = new URL(connectionString.replace(/^postgres/, 'http'));
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        const envVarName = process.env.DATABASE_URL ? 'DATABASE_URL' : 'POSTGRES_URL';
        console.warn(
          `⚠️  WARNING: ${envVarName} points to localhost in production. ` +
          'This is likely a configuration error. Please use your production database connection string.'
        );
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  return connectionString;
}

// 使用全局变量缓存连接，避免重复初始化
const globalForDb = globalThis as unknown as {
  _dbClient?: postgres.Sql;
  _dbInstance?: ReturnType<typeof drizzle>;
};

// 获取数据库实例（懒加载，只在运行时初始化）
export function getDb(): ReturnType<typeof drizzle> {
  if (globalForDb._dbInstance) {
    return globalForDb._dbInstance;
  }

  const connectionString = getConnectionString();
  const client = postgres(connectionString, { 
    prepare: false,
    connect_timeout: 10,
    max: 10,
  });

  globalForDb._dbClient = client;
  globalForDb._dbInstance = drizzle(client, { schema });
  return globalForDb._dbInstance;
}
