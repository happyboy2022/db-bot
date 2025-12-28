/**
 * 本地开发种子脚本 - 创建预设管理员用户
 *
 * 使用方法:
 *   bun run db:seed
 *
 * 此脚本会:
 * 1. 在 users 表中创建一个管理员用户（如果不存在）
 * 2. 在 accounts 表中创建密码凭证
 * 3. 将该用户的 profile 角色设置为 ADMIN
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
// 直接导入 better-auth 的密码哈希函数
import { hashPassword as betterAuthHashPassword } from 'better-auth/crypto';

// 预设管理员配置
const ADMIN_EMAIL = 'admin@localhost.dev';
const ADMIN_PASSWORD = 'admin123456';
const ADMIN_NAME = 'Local Admin';

/**
 * 生成 Better Auth 兼容的密码哈希
 * 直接使用 Better Auth 的哈希函数确保兼容性
 */
async function hashPassword(password: string): Promise<string> {
  return await betterAuthHashPassword(password);
}

/**
 * 生成 UUID
 */
function generateId(): string {
  return crypto.randomUUID();
}

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
  console.log('🌱 开始执行种子脚本...\n');

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
    // 1. 检查用户是否已存在
    console.log(`📧 检查用户: ${ADMIN_EMAIL}`);
    const [existingUser] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL));

    let userId: string;

    if (existingUser) {
      console.log(`   ✓ 用户已存在 (ID: ${existingUser.id})`);
      userId = existingUser.id;
    } else {
      // 2. 创建新用户
      console.log('   创建新用户...');
      userId = generateId();
      const now = new Date();

      await db.insert(users).values({
        id: userId,
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });

      console.log(`   ✓ 用户创建成功 (ID: ${userId})`);

      // 3. 创建账户记录（存储密码）
      console.log('   创建账户凭证...');
      const hashedPassword = await hashPassword(ADMIN_PASSWORD);
      const accountId = generateId();

      await db.insert(accounts).values({
        id: accountId,
        accountId: userId,
        providerId: 'credential',
        userId: userId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      });

      console.log('   ✓ 账户凭证创建成功');
    }

    // 4. 检查或创建 profile
    console.log('\n👤 检查 profile...');
    let [existingProfile] = await db.select().from(profiles).where(eq(profiles.id, userId));

    if (!existingProfile) {
      console.log('   创建 profile...');

      try {
        await db.insert(profiles).values({
          id: userId,
          email: ADMIN_EMAIL,
          displayName: ADMIN_NAME,
          role: 'PENDING',
          status: 'ACTIVE',
        });
        console.log('   ✓ Profile 创建成功');
        existingProfile = (await db.select().from(profiles).where(eq(profiles.id, userId)))[0];
      } catch (error: any) {
        if (error.code === '23505') {
          // 唯一约束冲突，说明 profile 在插入时已存在，重新查询
          console.log('   Profile 已存在，重新查询...');
          existingProfile = (await db.select().from(profiles).where(eq(profiles.id, userId)))[0];
        } else {
          throw error;
        }
      }
    } else {
      console.log('   ✓ Profile 已存在');
    }

    // 5. 更新用户角色为 ADMIN
    console.log('\n👑 设置管理员角色...');
    const now = new Date();

    try {
      await db
        .update(profiles)
        .set({
          role: 'ADMIN',
          status: 'ACTIVE',
          activatedAt: now,
          updatedAt: now,
        })
        .where(eq(profiles.id, userId));

      // 验证更新是否成功
      const [updatedProfile] = await db.select().from(profiles).where(eq(profiles.id, userId));
      if (updatedProfile && updatedProfile.role === 'ADMIN') {
        console.log('   ✓ 角色已更新为 ADMIN');
      } else {
        throw new Error('角色更新失败，请检查数据库权限');
      }
    } catch (error: any) {
      // 检查是否是表不存在
      if (error.message?.includes('does not exist') || error.message?.includes('relation') || error.code === '42P01') {
        console.error('   ❌ 数据库表不存在');
        console.error('   💡 提示: 请先运行数据库迁移');
        console.error('   💡 运行命令: make db-migrate');
        throw new Error('数据库表不存在，请先运行迁移');
      }
      throw error;
    }

    // 6. 验证结果
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId));
    if (profile) {
      console.log('\n✅ 种子数据创建成功!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('  管理员账户信息:');
      console.log(`  📧 邮箱: ${ADMIN_EMAIL}`);
      console.log(`  🔑 密码: ${ADMIN_PASSWORD}`);
      console.log(`  👤 角色: ${profile.role}`);
      console.log(`  🆔 ID:   ${profile.id}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    } else {
      console.warn('⚠️  Profile 未找到');
    }
  } catch (error: any) {
    const isTableMissing = error.message?.includes('does not exist') ||
                          error.message?.includes('relation') ||
                          error.code === '42P01';

    if (!isTableMissing) {
      console.error('\n❌ 种子脚本执行失败:');
    }

    if (error.code === 'ENOTFOUND') {
      console.error('   DNS 解析失败，无法连接到数据库');
      console.error('   请检查 DATABASE_URL 中的主机名是否正确');
    } else if (isTableMissing) {
      console.error('\n❌ 种子脚本执行失败:');
      console.error('   数据库表不存在，请先运行迁移');
      console.error('\n💡 解决方法:');
      console.error('   1. 运行数据库迁移创建表结构:');
      console.error('      make db-migrate');
      console.error('   2. 迁移完成后再次运行: make db-seed');
    } else if (error.message) {
      console.error(`   ${error.message}`);
      console.error('\n💡 故障排查:');
      console.error('   1. 检查 apps/console/.env.local 中的 DATABASE_URL 配置');
      console.error('   2. 确认数据库连接正常');
      console.error('   3. 查看上面的详细错误信息');
    } else {
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
