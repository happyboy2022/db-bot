import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function ExecuteRequestLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      {/* 面包屑导航 */}
      <nav className="mb-6 flex items-center gap-2 text-sm">
        <Skeleton className="h-4 w-16" />
        <span className="text-gray-400">/</span>
        <Skeleton className="h-4 w-32" />
        <span className="text-gray-400">/</span>
        <Skeleton className="h-4 w-16" />
      </nav>

      {/* 页面标题 */}
      <div className="mb-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>

      {/* 加载指示器 */}
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">准备执行环境...</span>
        </div>
      </div>

      {/* 执行确认卡片 */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="space-y-6">
          {/* 警告提示 */}
          <Skeleton className="h-16 w-full rounded-lg" />

          {/* SQL 预览 */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-32 w-full" />
          </div>

          {/* 目标信息 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-10 w-full" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>

          {/* 执行按钮 */}
          <div className="flex justify-end gap-3 border-t pt-6">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
