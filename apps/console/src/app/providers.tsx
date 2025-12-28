'use client';

import type { ReactNode } from 'react';
import { TabProvider } from '@/lib/contexts/tab-context';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return <TabProvider>{children}</TabProvider>;
}
