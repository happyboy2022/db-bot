import { requireAdmin } from '@/lib/auth';
import { getAllTemplatesForAdmin } from '@/lib/queries/templates';
import { TemplateList } from '@/components/admin/template-list';

export default async function TemplatesPage() {
  await requireAdmin();

  const templates = await getAllTemplatesForAdmin();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            模板管理
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            管理常用操作的 SQL 模板。
          </p>
        </div>
      </div>

      <TemplateList templates={templates} />
    </div>
  );
}
