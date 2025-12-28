'use client';

import { memo, useMemo } from 'react';
import { usePathname } from 'next/navigation';
import { LogOut, User, ChevronDown, Shield } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/app/(auth)/login/actions";
import { Breadcrumb } from "./breadcrumb";

interface HeaderProps {
  user?: {
    email: string;
    displayName: string | null;
    role: string;
  } | null;
}

// 页面标题映射（常量，不会重新创建）
const PAGE_TITLES: Readonly<Record<string, string>> = {
  '/dashboard': '仪表盘',
  '/requests': 'SQL 请求',
  '/requests/new': '新建请求',
  '/requests/import': '导入请求',
  '/admin/approvals': '审批管理',
  '/admin/users': '用户管理',
  '/admin/clusters': '集群管理',
  '/admin/databases': '数据库管理',
  '/admin/templates': '模板管理',
  '/admin/sessions': '会话管理',
  '/admin/audit': '审计日志',
  '/admin/settings': '系统设置',
  '/settings/security': '安全设置',
};

// 获取页面标题
function getPageTitle(pathname: string): string {
  // 精确匹配
  if (PAGE_TITLES[pathname]) {
    return PAGE_TITLES[pathname];
  }

  // 动态路由匹配
  if (pathname.startsWith('/requests/') && pathname.endsWith('/edit')) {
    return '编辑请求';
  }
  if (pathname.startsWith('/requests/') && pathname.endsWith('/execute')) {
    return '执行请求';
  }
  if (pathname.match(/^\/requests\/[^/]+$/)) {
    return '请求详情';
  }

  // 默认标题
  return 'SQL Ops Console';
}

// 获取用户首字母
function getUserInitials(user: HeaderProps['user']): string {
  if (!user) return '?';

  if (user.displayName) {
    // 如果有显示名称，取前两个字符（支持中文）
    return user.displayName.slice(0, 2).toUpperCase();
  }

  // 否则使用邮箱首字母
  return user.email.charAt(0).toUpperCase();
}

// 获取角色显示名称
function getRoleLabel(role: string): string {
  switch (role) {
    case 'ADMIN':
      return '管理员';
    case 'USER':
      return '普通用户';
    case 'PENDING':
      return '待激活';
    default:
      return role;
  }
}

// 使用 memo 包装 Header，避免不必要的重新渲染
export const Header = memo(function Header({ user }: HeaderProps) {
  const pathname = usePathname();

  // 使用 useMemo 缓存计算结果
  const pageTitle = useMemo(() => getPageTitle(pathname), [pathname]);
  const userInitials = useMemo(() => getUserInitials(user), [user]);

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-4">
        <div className="flex flex-col">
          <h2 className="text-lg font-medium tracking-tight">{pageTitle}</h2>
          <Breadcrumb />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start text-left">
                <span className="text-sm font-medium">
                  {user?.displayName || user?.email?.split('@')[0] || '用户'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {user?.role ? getRoleLabel(user.role) : ''}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {user?.displayName || '未设置昵称'}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {user?.email || ''}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs text-muted-foreground">
              <User className="mr-2 h-4 w-4" />
              角色: {user?.role ? getRoleLabel(user.role) : '-'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/security" className="flex items-center">
                <Shield className="mr-2 h-4 w-4" />
                安全设置
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <form action={logout} className="w-full">
                <button type="submit" className="flex w-full items-center text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
});
