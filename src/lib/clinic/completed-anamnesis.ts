import { mutate } from '@/lib/mysql/db';

/** Preserve submitted health records; revoke only unfinished links for completed sessions. */
export async function revokeCompletedAnamnesis(accountId: string) {
  await mutate(
    `UPDATE clinic_anamnesis_forms f JOIN clinic_appointments a ON a.id=f.appointment_id AND a.account_id=f.account_id SET f.status='revoked' WHERE f.account_id=? AND f.status='pending' AND a.status='completed'`,
    [accountId]
  );
}

export function isCompletedPendingAnamnesis(form: {
  status: string;
  appointment?: { status?: string } | { status?: string }[] | null;
}) {
  const appointment = Array.isArray(form.appointment)
    ? form.appointment[0]
    : form.appointment;
  return form.status === 'pending' && appointment?.status === 'completed';
}
