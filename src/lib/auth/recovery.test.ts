import { describe, expect, it } from 'vitest';

import { hashRecoveryToken, isRecoveryToken, safeInternalPath } from './recovery';

describe('password recovery helpers', () => {
  it('accepts only base64url recovery tokens of the expected size', () => {
    expect(isRecoveryToken('a'.repeat(43))).toBe(true);
    expect(isRecoveryToken('short')).toBe(false);
    expect(isRecoveryToken('a'.repeat(40) + '!')).toBe(false);
  });

  it('hashes recovery tokens before they are persisted or queried', () => {
    expect(hashRecoveryToken('a'.repeat(43))).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRecoveryToken('a'.repeat(43))).not.toBe('a'.repeat(43));
  });

  it('never permits an external or malformed return path', () => {
    expect(safeInternalPath('/reset-password', '/login')).toBe('/reset-password');
    expect(safeInternalPath('//attacker.example', '/login')).toBe('/login');
    expect(safeInternalPath('https://attacker.example', '/login')).toBe('/login');
    expect(safeInternalPath('/\\attacker.example', '/login')).toBe('/login');
  });
});
