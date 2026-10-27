import { expect, it } from 'vitest';
import {
  portalAnamnesisLabel,
  portalAnamnesisStatus,
} from './anamnesis-status';
it.each([{ status: 'completed' }, [{ status: 'completed' }]])(
  'shows an unfinished completed session form as cancelled',
  (appointment) => {
    expect(portalAnamnesisStatus({ status: 'pending', appointment })).toBe(
      'revoked'
    );
  }
);
it.each(['submitted', 'reviewed', 'expired', 'revoked'])(
  'preserves %s records',
  (status) => {
    expect(
      portalAnamnesisStatus({ status, appointment: { status: 'completed' } })
    ).toBe(status);
  }
);
it('keeps an upcoming form available and labels revoked links clearly', () => {
  expect(
    portalAnamnesisStatus({
      status: 'pending',
      appointment: { status: 'confirmed' },
    })
  ).toBe('pending');
  expect(portalAnamnesisLabel('revoked')).toBe('Cancelada');
});
