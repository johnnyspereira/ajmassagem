import type { ReactNode } from 'react';
import { metadataForRoute } from '@/lib/sharing/metadata';
export const metadata = metadataForRoute('/reports');
export default function SharingLayout({ children }: { children: ReactNode }) {
  return children;
}
