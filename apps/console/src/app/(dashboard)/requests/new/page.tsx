import { requireActiveUser } from '@/lib/auth';
import { getClustersWithTargets } from '@/lib/queries/targets';
import { getTemplates } from '@/lib/queries/templates';
import { getRequestForCopy } from '@/lib/queries/request-detail';
import { RequestForm, type RequestFormInitialData } from '@/components/requests/request-form';
import Link from 'next/link';

export const metadata = {
  title: '创建请求 - SQL Ops Console',
};

interface NewRequestPageProps {
  searchParams: Promise<{
    copyFrom?: string;
  }>;
}

export default async function NewRequestPage({ searchParams }: NewRequestPageProps) {
  const user = await requireActiveUser();
  const params = await searchParams;

  const [clusters, templates] = await Promise.all([
    getClustersWithTargets(),
    getTemplates(),
  ]);

  // If copyFrom is provided, fetch the original request data
  let initialData: RequestFormInitialData | undefined;
  const isCopy = !!params.copyFrom;
  if (params.copyFrom) {
    const isAdmin = user.role === 'ADMIN';
    const copyData = await getRequestForCopy(params.copyFrom, user.id, isAdmin);
    if (copyData) {
      initialData = copyData;
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/requests" className="hover:text-gray-700">
          SQL 请求
        </Link>
        <span>/</span>
        <span className="text-gray-900">{isCopy ? '复制请求' : '新建请求'}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          {isCopy ? '复制 SQL 请求' : '创建 SQL 请求'}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {isCopy
            ? '基于现有请求创建新的 SQL 请求草稿，您可以在提交前进行修改。'
            : '提交新的 SQL 请求以供审批和执行。'}
        </p>
      </div>

      {/* Form */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <RequestForm clusters={clusters} templates={templates} initialData={initialData} />
      </div>
    </div>
  );
}
