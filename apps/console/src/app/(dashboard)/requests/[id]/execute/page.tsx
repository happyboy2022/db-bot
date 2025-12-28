import { notFound, redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getRequestForExecution } from './queries';
import { ExecutePageClient } from './client';

interface ExecutePageProps {
  params: Promise<{ id: string }>;
}

export default async function ExecutePage({ params }: ExecutePageProps) {
  await requireAdmin();
  const { id } = await params;

  const request = await getRequestForExecution(id);

  if (!request) {
    notFound();
  }

  // Check if request is approved
  if (request.status !== 'APPROVED') {
    redirect(`/requests/${id}`);
  }

  // Check if approval has expired
  if (request.expiresAt && new Date() > new Date(request.expiresAt)) {
    redirect(`/requests/${id}`);
  }

  return (
    <ExecutePageClient
      requestId={request.id}
      requestTitle={request.title}
      versionId={request.approvedVersionId!}
      version={request.approvedVersion}
      clusterId={request.clusterName.toLowerCase()}
      dbType={request.dbType}
      code={request.code}
      statements={request.statements}
    />
  );
}
