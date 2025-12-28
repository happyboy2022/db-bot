'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth-config';
import { getDb } from '@/db';
import { profiles } from '@/db/schema';

export async function register(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const displayName = formData.get('displayName') as string;

  if (!email || !password) {
    return { error: '请输入邮箱和密码' };
  }

  try {
    const headersList = await headers();

    // 使用 Better Auth 注册用户
    const result = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: displayName || email.split('@')[0],
      },
      headers: headersList,
    });

    if (!result || 'error' in result) {
      const errorObj = result as { error?: { message?: string } } | null;
      const errorMsg = errorObj?.error?.message || '注册失败';
      return { error: errorMsg };
    }

    // 创建 profile 记录
    const db = getDb();
    await db.insert(profiles).values({
      id: result.user.id,
      email: result.user.email,
      displayName: displayName || null,
      role: 'PENDING', // 新用户默认为待审核状态
      status: 'ACTIVE',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误';
    if (message.includes('fetch failed') || message.includes('ECONNREFUSED')) {
      return { error: '无法连接到认证服务，请检查服务器配置' };
    }
    if (message.includes('already exists') || message.includes('duplicate')) {
      return { error: '该邮箱已被注册' };
    }
    return { error: message };
  }

  redirect('/pending');
}
