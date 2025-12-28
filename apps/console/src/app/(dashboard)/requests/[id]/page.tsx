import { notFound } from 'next/navigation';
import { requireActiveUser } from '@/lib/auth';
import { getRequestDetail } from '@/lib/queries/request-detail';
import { RequestDetail } from '@/components/requests/request-detail';

interface RequestDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RequestDetailPage({ params }: RequestDetailPageProps) {
  const user = await requireActiveUser();
  const { id } = await params;
  const isAdmin = user.role === 'ADMIN';

  const request = await getRequestDetail(id, user.id, isAdmin);

  if (!request) {
    notFound();
  }

  return <RequestDetail request={request} isAdmin={isAdmin} />;
}
