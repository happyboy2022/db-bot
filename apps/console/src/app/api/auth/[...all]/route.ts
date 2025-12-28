/**
 * Better Auth API 路由
 *
 * 处理所有 /api/auth/* 请求
 */

import { auth } from '@/lib/auth-config';
import { toNextJsHandler } from 'better-auth/next-js';

export const { GET, POST } = toNextJsHandler(auth);
