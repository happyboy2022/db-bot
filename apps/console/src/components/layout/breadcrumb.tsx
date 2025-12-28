'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href: string;
  isActive?: boolean;
}

// 路由配置 - 定义路由层级关系和标题
const ROUTE_CONFIG: Record<string, { label: string; parent?: string }> = {
  '/dashboard': { label: '仪表盘' },
  '/requests': { label: 'SQL 请求' },
  '/requests/new': { label: '新建请求', parent: '/requests' },
  '/requests/import': { label: '导入请求', parent: '/requests' },
  '/admin/approvals': { label: '审批管理' },
  '/admin/users': { label: '用户管理' },
  '/admin/clusters': { label: '集群管理' },
  '/admin/databases': { label: '数据库管理' },
  '/admin/templates': { label: '模板管理' },
  '/admin/sessions': { label: '会话管理' },
  '/admin/audit': { label: '审计日志' },
};

// 动态路由匹配 - 处理带参数的路由
function getDynamicRouteConfig(pathname: string): { label: string; parent?: string } | null {
  // 请求编辑页面: /requests/:id/edit
  if (pathname.match(/^\/requests\/[^/]+\/edit$/)) {
    return { label: '编辑请求', parent: pathname.replace('/edit', '') };
  }

  // 请求执行页面: /requests/:id/execute
  if (pathname.match(/^\/requests\/[^/]+\/execute$/)) {
    return { label: '执行请求', parent: pathname.replace('/execute', '') };
  }

  // 请求详情页面: /requests/:id
  if (pathname.match(/^\/requests\/[^/]+$/) && pathname !== '/requests/new' && pathname !== '/requests/import') {
    return { label: '请求详情', parent: '/requests' };
  }

  return null;
}

// 获取路由配置
function getRouteConfig(pathname: string): { label: string; parent?: string } | null {
  // 先检查静态路由
  if (ROUTE_CONFIG[pathname]) {
    return ROUTE_CONFIG[pathname];
  }

  // 再检查动态路由
  return getDynamicRouteConfig(pathname);
}

// 生成面包屑路径
function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const items: BreadcrumbItem[] = [];
  let currentPath = pathname;

  // 递归向上查找父级路由
  while (currentPath) {
    const config = getRouteConfig(currentPath);
    if (config) {
      items.unshift({
        label: config.label,
        href: currentPath,
        isActive: currentPath === pathname,
      });
      currentPath = config.parent || '';
    } else {
      break;
    }
  }

  return items;
}

export const Breadcrumb = memo(function Breadcrumb() {
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => generateBreadcrumbs(pathname), [pathname]);

  // 如果面包屑只有一级或为空，不显示
  if (breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <nav
      className="flex items-center gap-1 text-sm text-muted-foreground"
      aria-label="面包屑导航"
    >
      <Link
        href="/dashboard"
        className="flex items-center hover:text-foreground transition-colors"
        aria-label="首页"
      >
        <Home className="h-4 w-4" />
      </Link>

      {breadcrumbs.map((item) => (
        <div key={item.href} className="flex items-center gap-1">
          <ChevronRight className="h-4 w-4" />
          {item.isActive ? (
            <span
              className="font-medium text-foreground"
              aria-current="page"
            >
              {item.label}
            </span>
          ) : (
            <Link
              href={item.href}
              className={cn(
                "hover:text-foreground transition-colors",
                "hover:underline underline-offset-4"
              )}
            >
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
});
