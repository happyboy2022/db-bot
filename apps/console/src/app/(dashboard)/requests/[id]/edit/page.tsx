import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { requireActiveUser } from '@/lib/auth';
import { getRequestDetail } from '@/lib/queries/request-detail';
import { getTemplates } from '@/lib/queries/templates';
import { RequestEditForm } from '@/components/requests/request-edit-form';

// States that allow modification
const MODIFIABLE_STATES = [
  'PENDING_APPROVAL',
  'CHANGES_REQUESTED',
  'REJECTED',
  'APPROVAL_EXPIRED',
  'FAILED',
];

interface EditRequestPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditRequestPage({ params }: EditRequestPageProps) {
  const user = await requireActiveUser();
  const { id } = await params;

  const request = await getRequestDetail(id, user.id, user.role === 'ADMIN');

  if (!request) {
    notFound();
  }

  // Only the creator can modify
  if (request.createdByEmail !== user.email) {
    redirect(`/requests/${id}`);
  }

  // Check if request is in a modifiable state
  if (!MODIFIABLE_STATES.includes(request.status)) {
    redirect(`/requests/${id}`);
  }

  // Get current version
  const currentVersion = request.versions.find((v) => v.isCurrentVersion);
  if (!currentVersion) {
    notFound();
  }

  // Get templates for form
  const templates = await getTemplates();

  // Build prechecks from current statements
  const prechecks = currentVersion.statements
    .filter((s) => s.precheckSql)
    .map((s) => ({
      statementIndex: s.orderIndex,
      precheckSql: s.precheckSql!,
      expectedRows: null,
    }));

  return (
    <div className="mx-auto max-w-4xl">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Link href="/requests" className="hover:text-gray-700">
          Requests
        </Link>
        <span>/</span>
        <Link href={`/requests/${id}`} className="hover:text-gray-700">
          {request.title}
        </Link>
        <span>/</span>
        <span className="text-gray-900">Edit</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          Edit Request
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Modify the SQL request. If you change the SQL content, a new version will be created.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <RequestEditForm
          requestId={id}
          initialTitle={request.title}
          initialDescription={request.description || ''}
          initialSqlRaw={currentVersion.sqlRaw}
          initialPrechecks={prechecks}
          targetDisplayName={request.targetDisplayName}
          dbType={request.dbType}
          clusterName={request.clusterName}
          clusterRegion={request.clusterRegion}
          templates={templates}
        />
      </div>
    </div>
  );
}
