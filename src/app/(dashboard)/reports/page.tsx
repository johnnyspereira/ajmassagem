import { ReportsPage } from '@/components/reports/reports-page';
import { PackSalesReport } from '@/components/reports/pack-sales-report';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ pack?: string | string[] }>;
}) {
  const { pack } = await searchParams;
  if (typeof pack === 'string' && pack)
    return <PackSalesReport key={pack} packId={pack} />;
  return <ReportsPage />;
}
