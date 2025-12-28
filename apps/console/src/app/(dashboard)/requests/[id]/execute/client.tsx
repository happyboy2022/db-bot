'use client';

import { useRouter } from 'next/navigation';
import { ExecuteDialog, type ExecuteDialogStatement } from '@/components/requests/execute-dialog';

interface ExecutePageClientProps {
  requestId: string;
  requestTitle: string;
  versionId: string;
  version: number;
  clusterId: string;
  dbType: string;
  code: string;
  statements: ExecuteDialogStatement[];
}

export function ExecutePageClient({
  requestId,
  requestTitle,
  versionId,
  version,
  clusterId,
  dbType,
  code,
  statements,
}: ExecutePageClientProps) {
  const router = useRouter();

  const handleClose = () => {
    router.push(`/requests/${requestId}`);
  };

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleClose}
          className="text-gray-400 hover:text-gray-600"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
        </button>
        <h1 className="text-xl font-semibold text-gray-900">
          Execute: {requestTitle}
        </h1>
      </div>

      {/* Execute dialog */}
      <ExecuteDialog
        requestId={requestId}
        versionId={versionId}
        version={version}
        clusterId={clusterId}
        dbType={dbType}
        code={code}
        statements={statements}
        onClose={handleClose}
      />
    </div>
  );
}
