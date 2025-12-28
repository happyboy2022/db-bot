/**
 * 获取当前用户 Profile API
 *
 * 用于客户端获取用户角色等信息
 */

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth-config';
import { getDb } from '@/db';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const headersList = await headers();
    const session = await auth.api.getSession({
      headers: headersList,
    });

    if (!session?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const db = getDb();
    const [profile] = await db
      .select({
        id: profiles.id,
        email: profiles.email,
        displayName: profiles.displayName,
        role: profiles.role,
        status: profiles.status,
      })
      .from(profiles)
      .where(eq(profiles.id, session.user.id));

    if (!profile) {
      return NextResponse.json({ error: 'Profile 不存在' }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('获取 Profile 失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
