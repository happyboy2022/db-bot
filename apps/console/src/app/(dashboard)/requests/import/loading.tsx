import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

export default function ImportRequestLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      {/* 面包屑导航 */}
      <nav className="mb-6 flex items-center gap-2 text-sm">
        <Skeleton className="h-4 w-16" />
        <span className="text-gray-400">/</span>
        <Skeleton className="h-4 w-20" />
      </nav>

      {/* 页面标题 */}
      <div className="mb-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      {/* 导入表单骨架 */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        {/* 加载指示器 */}
        <div className="flex items-center justify-center py-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">加载导入表单...</span>
          </div>
        </div>

        <div className="space-y-6">
          {/* 文件上传区域 */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>

          {/* 预览区域 */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-24 w-full" />
          </div>

          {/* 提交按钮 */}
          <div className="flex justify-end gap-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
      </div>
    </div>
  );
}
