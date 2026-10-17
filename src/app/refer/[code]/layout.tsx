import type { ReactNode } from 'react';
import { metadataForRoute } from '@/lib/sharing/metadata';
export const metadata = metadataForRoute('/refer/[code]');
export default function ReferralLayout({ children }: { children: ReactNode }) {
  return children;
}
