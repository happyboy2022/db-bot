import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function RequestDetailLoading() {
  return (
    <div className="space-y-6">
      {/* 面包屑导航 */}
      <nav className="flex items-center gap-2 text-sm">
        <Skeleton className="h-4 w-16" />
        <span className="text-gray-400">/</span>
        <Skeleton className="h-4 w-32" />
      </nav>

      {/* 请求头部信息 */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-28" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>

      {/* 加载指示器 */}
      <div className="flex items-center justify-center py-4">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">加载请求详情...</span>
        </div>
      </div>

      {/* 请求详情卡片 */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* 左侧 - SQL 内容 */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border bg-card p-6">
            <Skeleton className="h-5 w-24 mb-4" />
            <Skeleton className="h-48 w-full" />
          </div>

          {/* 执行结果 */}
          <div className="rounded-lg border bg-card p-6">
            <Skeleton className="h-5 w-28 mb-4" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>

        {/* 右侧 - 元信息 */}
        <div className="space-y-4">
          {/* 目标信息 */}
          <div className="rounded-lg border bg-card p-6">
            <Skeleton className="h-5 w-24 mb-4" />
            <div className="space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
              </div>
              <div className="flex justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          </div>

          {/* 时间线 */}
          <div className="rounded-lg border bg-card p-6">
            <Skeleton className="h-5 w-20 mb-4" />
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
