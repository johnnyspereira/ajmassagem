import type { RowDataPacket } from 'mysql2';
import { redirect } from 'next/navigation';

import { selectRows } from '@/lib/mysql/db';
import { InstallForm } from './install-form';

export default async function InstallPage() {
  const rows = await selectRows<(RowDataPacket & { total: number })[]>('SELECT COUNT(*) AS total FROM app_users');
  if (Number(rows[0]?.total ?? 0) > 0) redirect('/login');
  return <InstallForm />;
}
