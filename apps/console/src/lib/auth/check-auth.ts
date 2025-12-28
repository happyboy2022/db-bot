import { redirect } from 'next/navigation';
import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth-config';
import { getDb } from '@/db';
import { profiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export type UserRole = 'PENDING' | 'USER' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  displayName: string | null;
}

/**
 * 获取当前会话
 * 使用 Better Auth 的 api.getSession
 */
async function getSession() {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });
  return session;
}

/**
 * Require authenticated user - redirects to login if not authenticated
 * 使用 cache() 在单个请求周期内缓存结果，避免重复查询
 */
export const requireAuth = cache(async (): Promise<AuthUser> => {
  const session = await getSession();

  if (!session?.user) {
    redirect('/login');
  }

  const db = getDb();
  const [profile] = await db
    .select({
      role: profiles.role,
      displayName: profiles.displayName,
    })
    .from(profiles)
    .where(eq(profiles.id, session.user.id));

  if (!profile) {
    redirect('/login');
  }

  return {
    id: session.user.id,
    email: session.user.email,
    role: profile.role as UserRole,
    displayName: profile.displayName,
  };
});

/**
 * Require admin user - redirects to forbidden if not admin
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();

  if (user.role !== 'ADMIN') {
    redirect('/forbidden');
  }

  return user;
}

/**
 * Require active user (USER or ADMIN) - redirects to pending if PENDING
 */
export async function requireActiveUser(): Promise<AuthUser> {
  const user = await requireAuth();

  if (user.role === 'PENDING') {
    redirect('/pending');
  }

  return user;
}

/**
 * Get current user without redirecting
 * 使用 React.cache() 在同一请求生命周期内去重查询
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const session = await getSession();

  if (!session?.user) {
    return null;
  }

  const db = getDb();
  const [profile] = await db
    .select({
      role: profiles.role,
      displayName: profiles.displayName,
    })
    .from(profiles)
    .where(eq(profiles.id, session.user.id));

  if (!profile) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    role: profile.role as UserRole,
    displayName: profile.displayName,
  };
});

/**
 * 登出用户
 */
export async function logout() {
  const headersList = await headers();
  await auth.api.signOut({
    headers: headersList,
  });
  redirect('/login');
}
