'use client';

import { memo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, RotateCw } from 'lucide-react';
import { useTabs } from '@/lib/contexts/tab-context';
import { cn } from '@/lib/utils';

const TabItem = memo(function TabItem({
  id,
  href,
  label,
  closable,
  isActive,
  onSwitch,
  onRemove,
  onRefresh,
}: {
  id: string;
  href: string;
  label: string;
  closable: boolean;
  isActive: boolean;
  onSwitch: (id: string) => void;
  onRemove: (id: string) => void;
  onRefresh: (href: string) => void;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsRefreshing(true);
      onRefresh(href);
      setTimeout(() => setIsRefreshing(false), 500);
    },
    [href, onRefresh]
  );

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRemove(id);
    },
    [id, onRemove]
  );

  return (
    <div
      className={cn(
        'group relative flex items-center gap-2 px-4 py-2 cursor-pointer transition-all',
        'border-t border-l border-r rounded-t-md min-w-[120px] max-w-[200px]',
        isActive
          ? 'bg-background border-border -mb-px z-10'
          : 'bg-muted/50 border-transparent hover:bg-muted/80 text-muted-foreground hover:text-foreground'
      )}
      onClick={() => onSwitch(id)}
      title={label}
    >
      <span className="truncate flex-1 text-sm">{label}</span>

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* 刷新按钮 */}
        <button
          type="button"
          className={cn(
            'h-5 w-5 flex items-center justify-center rounded-sm transition-all',
            isActive
              ? 'opacity-60 hover:opacity-100 hover:bg-muted'
              : 'opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-muted-foreground/20'
          )}
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RotateCw
            className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')}
          />
          <span className="sr-only">刷新</span>
        </button>

        {/* 关闭按钮 */}
        {closable && (
          <button
            type="button"
            className={cn(
              'h-5 w-5 flex items-center justify-center rounded-sm transition-all',
              isActive
                ? 'opacity-60 hover:opacity-100 hover:bg-muted'
                : 'opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-muted-foreground/20'
            )}
            onClick={handleClose}
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">关闭</span>
          </button>
        )}
      </div>
    </div>
  );
});

export const TabBar = memo(function TabBar() {
  const { tabs, activeTabId, switchTab, removeTab } = useTabs();
  const router = useRouter();

  const handleRefresh = useCallback(
    (href: string) => {
      if (tabs.find((t) => t.href === href)?.id === activeTabId) {
        router.refresh();
      } else {
        router.push(href);
        setTimeout(() => router.refresh(), 100);
      }
    },
    [tabs, activeTabId, router]
  );

  // 如果没有页签，不渲染
  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="flex items-end bg-muted/40 px-2 pt-2 border-b border-border overflow-x-auto scrollbar-hide">
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          id={tab.id}
          href={tab.href}
          label={tab.label}
          closable={tab.closable}
          isActive={tab.id === activeTabId}
          onSwitch={switchTab}
          onRemove={removeTab}
          onRefresh={handleRefresh}
        />
      ))}
    </div>
  );
});
