import Link from 'next/link';
import { requireActiveUser } from '@/lib/auth';
import { getClustersWithTargets } from '@/lib/queries/targets';
import { ImportForm } from '@/components/requests/import-form';

export const metadata = {
  title: 'Import Requests | SQL Ops Console',
};

export default async function ImportPage() {
  await requireActiveUser();

  const clusters = await getClustersWithTargets();

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <Link
          href="/requests"
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Requests
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import Requests</h1>
        <p className="mt-1 text-sm text-gray-600">
          Import SQL requests from a previously exported JSON file.
        </p>
      </div>

      <ImportForm clusters={clusters} />
    </div>
  );
}
