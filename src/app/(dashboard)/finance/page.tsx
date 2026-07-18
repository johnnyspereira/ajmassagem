import { FinancePage } from '@/components/finance/finance-page';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    contact?: string;
    appointment?: string;
    tab?: string;
  }>;
}) {
  const { contact, appointment, tab } = await searchParams;
  return (
    <FinancePage
      initialContactId={contact}
      initialAppointmentId={appointment}
      initialTab={tab}
    />
  );
}
