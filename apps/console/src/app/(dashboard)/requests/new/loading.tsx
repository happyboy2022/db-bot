import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function NewRequestLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      {/* 面包屑导航 */}
      <nav className="mb-6 flex items-center gap-2 text-sm">
        <Skeleton className="h-4 w-16" />
        <span className="text-gray-400">/</span>
        <Skeleton className="h-4 w-24" />
      </nav>

      {/* 页面标题 */}
      <div className="mb-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="mt-2 h-4 w-72" />
      </div>

      {/* 表单骨架 */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        {/* 加载指示器 */}
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">加载表单...</span>
          </div>
        </div>

        <div className="space-y-6">
          {/* 标题字段 */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-10 w-full" />
          </div>

          {/* 服务选择 */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-10 w-full" />
          </div>

          {/* 目标选择 */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>

          {/* SQL 编辑器 */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-48 w-full" />
          </div>

          {/* 提交按钮 */}
          <div className="flex justify-end gap-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      </div>
    </div>
  );
}
