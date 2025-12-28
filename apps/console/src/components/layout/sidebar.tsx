'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Users,
  FileCode,
  Link as LinkIcon,
  ClipboardList,
  Network,
  Database,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

// 将 navItems 放在组件外部，避免每次渲染都重新创建
const NAV_ITEMS: readonly NavItem[] = [
  { href: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { href: '/requests', label: 'SQL 请求', icon: FileText },
  { href: '/admin/users', label: '用户管理', icon: Users },
  { href: '/admin/clusters', label: '集群', icon: Network },
  { href: '/admin/databases', label: '数据库', icon: Database },
  { href: '/admin/templates', label: '模板', icon: FileCode },
  { href: '/admin/sessions', label: '会话', icon: LinkIcon },
  { href: '/admin/audit', label: '审计日志', icon: ClipboardList },
  { href: '/admin/settings', label: '系统设置', icon: Settings },
] as const;

// 单个导航项组件，使用 memo 优化
const NavButton = memo(function NavButton({
  item,
  isActive
}: {
  item: NavItem;
  isActive: boolean
}) {
  return (
    <Button
      variant={isActive ? "secondary" : "ghost"}
      className={cn(
        "w-full justify-start gap-3",
        isActive && "bg-secondary"
      )}
      asChild
    >
      <Link href={item.href} prefetch={true}>
        <item.icon className="h-4 w-4" />
        {item.label}
      </Link>
    </Button>
  );
});

// 使用 memo 包装 Sidebar，避免不必要的重新渲染
export const Sidebar = memo(function Sidebar() {
  const pathname = usePathname();

  // 使用 useMemo 缓存计算结果
  const navButtons = useMemo(() =>
    NAV_ITEMS.map((item) => (
      <NavButton
        key={item.href}
        item={item}
        isActive={pathname.startsWith(item.href)}
      />
    )),
    [pathname]
  );

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-muted/40">
      <div className="flex h-16 items-center border-b px-6 bg-background">
        <h1 className="text-lg font-semibold tracking-tight">SQL 执行管理后台</h1>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navButtons}
      </nav>
    </aside>
  );
});
