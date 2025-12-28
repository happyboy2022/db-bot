'use client';

import { useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';

export type UserRole = 'PENDING' | 'USER' | 'ADMIN';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthState {
  user: AuthUser | null;
  role: UserRole | null;
  loading: boolean;
}

/**
 * 客户端认证状态 Hook
 *
 * 使用 Better Auth 的 useSession 获取认证状态
 * 然后通过 API 获取用户角色信息
 */
export function useAuth(): AuthState {
  const { data: session, isPending } = useSession();
  const [role, setRole] = useState<UserRole | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    async function fetchRole() {
      if (!session?.user) {
        setRole(null);
        setRoleLoading(false);
        return;
      }

      try {
        // 通过 API 获取用户角色
        const response = await fetch('/api/user/profile');
        if (response.ok) {
          const data = await response.json();
          setRole(data.role as UserRole);
        } else {
          setRole(null);
        }
      } catch {
        setRole(null);
      } finally {
        setRoleLoading(false);
      }
    }

    fetchRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  return {
    user: session?.user
      ? {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        }
      : null,
    role,
    loading: isPending || roleLoading,
  };
}

export function useIsAdmin(): boolean {
  const { role } = useAuth();
  return role === 'ADMIN';
}

export function useIsActiveUser(): boolean {
  const { role } = useAuth();
  return role === 'USER' || role === 'ADMIN';
}
