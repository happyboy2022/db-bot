/**
 * 本地开发清理脚本 - 删除预设管理员用户
 *
 * 使用方法:
 *   bun run db:unseed
 *
 * 此脚本会删除 seed-admin.ts 创建的管理员用户:
 * 1. 删除 profiles 表中的记录
 * 2. 删除 accounts 表中的记录
 * 3. 删除 users 表中的记录
 *
 * 环境变量要求:
 * - DATABASE_URL
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { users, accounts, profiles } from '../src/db/schema';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// 预设管理员配置（与 seed-admin.ts 保持一致）
const ADMIN_EMAIL = 'admin@localhost.dev';

/**
 * 加载环境变量文件
 */
function loadEnvFile(): void {
  const envPaths = [
    join(process.cwd(), '.env.local'),
    join(process.cwd(), '.env'),
  ];

  for (const envPath of envPaths) {
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const [key, ...valueParts] = trimmed.split('=');
            const value = valueParts.join('=').trim();
            // 移除引号
            const cleanValue = value.replace(/^["']|["']$/g, '');
            if (key && cleanValue && !process.env[key]) {
              process.env[key] = cleanValue;
            }
          }
        }

        console.log(`📄 已加载环境变量文件: ${envPath}\n`);
        return;
      } catch (error: any) {
        console.warn(`⚠️  读取 ${envPath} 失败: ${error.message}\n`);
      }
    }
  }

  console.warn('⚠️  未找到 .env.local 或 .env 文件，使用系统环境变量\n');
}

async function main() {
  console.log('🧹 开始执行清理脚本...\n');

  // 加载环境变量文件
  loadEnvFile();

  // 检查环境变量
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ 缺少必需的环境变量:');
    console.error('   - DATABASE_URL');
    console.error('\n💡 提示: 请确保在 apps/console/.env.local 文件中设置了 DATABASE_URL');
    process.exit(1);
  }

  // 验证 DATABASE_URL 格式
  if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
    console.error('❌ DATABASE_URL 格式错误:');
    console.error('   应该以 postgresql:// 或 postgres:// 开头');
    console.error(`   当前值: ${databaseUrl.substring(0, 50)}...`);
    process.exit(1);
  }

  // 解析并显示 DATABASE_URL 信息（用于调试）
  try {
    const url = new URL(databaseUrl.replace(/^postgres/, 'http'));
    const hostname = url.hostname;
    console.log('🔍 数据库连接信息:');
    console.log(`   主机名: ${hostname}`);
    console.log(`   端口: ${url.port || '5432 (默认)'}`);
    console.log(`   数据库: ${url.pathname.slice(1) || 'postgres'}\n`);
  } catch (e) {
    // 忽略解析错误
  }

  // 创建数据库连接
  let client: postgres.Sql;
  let db: ReturnType<typeof drizzle>;

  try {
    console.log('🔌 连接数据库...');
    client = postgres(databaseUrl, {
      prepare: false,
      max: 1, // 只使用一个连接
      connect_timeout: 10, // 10秒超时
    });
    db = drizzle(client);
    // 测试连接
    await client`SELECT 1`;
    console.log('   ✓ 数据库连接成功\n');
  } catch (error: any) {
    console.error('❌ 数据库连接失败:');
    if (error.code === 'ENOTFOUND') {
      console.error('   DNS 解析失败，无法找到数据库主机');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('   连接被拒绝，请检查数据库是否可访问');
    } else if (error.message?.includes('password')) {
      console.error('   认证失败，请检查 DATABASE_URL 中的用户名和密码');
    } else {
      console.error(`   ${error.message || error}`);
    }
    console.error(`\n💡 提示: 请检查 apps/console/.env.local 中的 DATABASE_URL 配置`);
    process.exit(1);
  }

  try {
    // 1. 查找用户
    console.log(`📧 查找用户: ${ADMIN_EMAIL}`);
    const [existingUser] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL));

    if (!existingUser) {
      console.log('   ℹ️  用户不存在，无需清理\n');
      console.log('✅ 清理完成（无操作）\n');
      return;
    }

    const userId = existingUser.id;
    console.log(`   ✓ 找到用户 (ID: ${userId})\n`);

    // 2. 删除 profile
    console.log('👤 删除 profile...');
    const profileResult = await db.delete(profiles).where(eq(profiles.id, userId));
    console.log('   ✓ Profile 已删除');

    // 3. 删除 accounts（可能有多条记录）
    console.log('🔑 删除账户凭证...');
    const accountResult = await db.delete(accounts).where(eq(accounts.userId, userId));
    console.log('   ✓ 账户凭证已删除');

    // 4. 删除 user
    console.log('🗑️  删除用户...');
    const userResult = await db.delete(users).where(eq(users.id, userId));
    console.log('   ✓ 用户已删除');

    // 5. 验证清理结果
    const [checkUser] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL));

    if (!checkUser) {
      console.log('\n✅ 清理成功!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  已删除的管理员账户:');
      console.log(`  📧 邮箱: ${ADMIN_EMAIL}`);
      console.log(`  🆔 ID:   ${userId}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('💡 提示: 运行 make db-seed 可重新创建管理员账户\n');
    } else {
      console.warn('\n⚠️  清理可能未完全成功，用户仍然存在');
    }
  } catch (error: any) {
    const isTableMissing = error.message?.includes('does not exist') ||
                          error.message?.includes('relation') ||
                          error.code === '42P01';

    if (isTableMissing) {
      console.error('\n❌ 清理脚本执行失败:');
      console.error('   数据库表不存在，请先运行迁移');
      console.error('\n💡 解决方法:');
      console.error('   1. 运行数据库迁移创建表结构:');
      console.error('      make db-migrate');
    } else if (error.message) {
      console.error('\n❌ 清理脚本执行失败:');
      console.error(`   ${error.message}`);
      console.error('\n💡 故障排查:');
      console.error('   1. 检查 apps/console/.env.local 中的 DATABASE_URL 配置');
      console.error('   2. 确认数据库连接正常');
      console.error('   3. 查看上面的详细错误信息');
    } else {
      console.error('\n❌ 清理脚本执行失败:');
      console.error(`   ${error}`);
    }
    process.exit(1);
  } finally {
    if (client!) {
      await client.end();
    }
  }
}

main();
