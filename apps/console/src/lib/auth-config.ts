/**
 * Better Auth 服务端配置
 *
 * 使用 Drizzle ORM 作为数据库适配器
 * 支持 Email/Password 认证
 *
 * 环境变量:
 *   - BETTER_AUTH_URL: 认证服务的基础 URL（开发时动态设置）
 *   - BETTER_AUTH_SECRET: 会话签名密钥（从 Doppler 获取）
 *   - BETTER_AUTH_TRUSTED_ORIGINS: 信任的来源（逗号分隔）
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { getDb } from '@/db';
import * as schema from '@/db/schema';

export const auth = betterAuth({
  // 动态 baseURL，支持开发时端口变化
  baseURL: process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL,

  database: drizzleAdapter(getDb(), {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),

  // Email/Password 认证
  emailAndPassword: {
    enabled: true,
    // 注册后需要管理员激活，所以不自动登录
    autoSignIn: false,
  },

  // 会话配置
  session: {
    // 会话有效期 7 天
    expiresIn: 60 * 60 * 24 * 7,
    // 刷新间隔 1 天
    updateAge: 60 * 60 * 24,
    // Cookie 配置
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 分钟
    },
  },

  // 用户注册钩子 - 创建 profile 记录
  user: {
    additionalFields: {
      // 额外字段会存储在 users 表中
    },
  },

  // 信任 Host (Vercel 部署需要)
  // 过滤空字符串，避免 Better Auth 报错
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').filter(Boolean) || [],

  // 插件配置
  plugins: [
    nextCookies(), // 确保 Server Actions 中正确设置 cookie
  ],
});

export type Session = typeof auth.$Infer.Session;
