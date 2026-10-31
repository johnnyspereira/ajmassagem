import { beforeEach, describe, expect, it, vi } from 'vitest';
const select = vi.hoisted(() => vi.fn());
vi.mock('@/lib/mysql/db', () => ({ selectRows: select }));
import { attentionSource, loadAttention } from './attention';

const now = new Date('2026-10-31T18:00:00Z');
beforeEach(() => {
  vi.clearAllMocks();
  select.mockImplementation(async (sql: string, values: unknown[]) => {
    expect((sql.match(/\?/g) || []).length).toBe(values.length);
    if (sql.includes('COUNT(*) total'))
      return [
        { kind: 'appointments', total: 2 },
        { kind: 'payments', total: 1 },
        { kind: 'messages', total: 1 },
      ];
    return [
      {
        kind: 'appointments',
        entity_id: 'appointment',
        target_id: 'appointment',
        contact_id: 'client',
        name: 'Cliente de teste',
        title: 'Massagem',
        detail: 'Sessão sem fecho',
        occurred_at: now,
        amount: null,
        currency: null,
        priority: 0,
      },
      {
        kind: 'payments',
        entity_id: 'sale',
        target_id: 'sale',
        contact_id: 'client',
        name: 'Cliente de teste',
        title: 'Venda #7',
        detail: 'Saldo pendente',
        occurred_at: now,
        amount: '25.00',
        currency: 'EUR',
        priority: 2,
      },
      {
        kind: 'messages',
        entity_id: 'message',
        target_id: 'conversation',
        contact_id: 'client',
        name: 'Cliente de teste',
        title: 'Falhou',
        detail: 'Rever',
        occurred_at: now,
        amount: null,
        currency: null,
        priority: 1,
      },
    ];
  });
});
describe('operational attention queue', () => {
  it('scopes each source to the authenticated account without writing anything', () => {
    const source = attentionSource('account-a', now);
    expect(source.values.filter((value) => value === 'account-a')).toHaveLength(
      5
    );
    expect(source.sql).not.toMatch(/\b(UPDATE|INSERT|DELETE|ALTER)\b/);
    expect(source.sql).toContain(
      "a.status IN ('scheduled','confirmed') AND a.scheduled_end<?"
    );
    expect(source.sql).toContain(
      "b.status='reserved' AND a.status='completed'"
    );
    expect(source.sql).toContain(
      "s.status IN ('open','partially_paid') AND s.balance_due>0"
    );
    expect(source.sql).toContain("o.status IN ('failed','dead')");
    expect(source.sql).toContain('COALESCE(s.is_historical,0)=0');
  });
  it('uses Lisbon midnight across summer and winter and follows the existing closing window', () => {
    expect(
      attentionSource('a', new Date('2026-07-01T12:00:00Z')).values[0]
    ).toEqual(new Date('2026-06-30T23:00:00Z'));
    expect(attentionSource('a', now).values[0]).toEqual(
      new Date('2026-10-31T00:00:00Z')
    );
    expect(
      attentionSource('a', new Date('2026-07-01T20:30:00Z')).values
    ).toContain(1);
    expect(
      attentionSource('a', new Date('2026-07-01T20:29:00Z')).values
    ).not.toContain(1);
  });
  it('keeps future scheduled deliveries and messages with a valid lease outside the stale queue', () => {
    const source = attentionSource('a', now);
    expect(source.sql).toContain('o.available_at<?');
    expect(source.sql).toContain('o.lease_until<?');
    expect(source.values).toContainEqual(new Date('2026-10-31T17:45:00Z'));
  });
  it('returns exact source counts and links to the original appointment, sale and conversation', async () => {
    const result = await loadAttention('account-a', 'all', 0, '', now);
    expect(result.total).toBe(4);
    expect(result.counts.cash).toBe(0);
    expect(result.items[0].href).toBe('/agenda?appointment=appointment');
    expect(result.items[1]).toMatchObject({
      amount: 25,
      currency: 'EUR',
      href: '/finance?tab=sales#sale-sale',
    });
    expect(result.items[2].href).toBe('/inbox?c=conversation');
    expect(result.items[0].urgent).toBe(true);
    expect(select).toHaveBeenCalledTimes(2);
  });
  it('paginates by a deterministic order and fetches one extra record to indicate more', async () => {
    const original = select.getMockImplementation()!;
    select.mockImplementation(async (sql: string, values: unknown[]) => {
      const rows = await original(sql, values);
      return sql.includes('COUNT(*) total')
        ? rows
        : Array.from({ length: 6 }, (_, i) => ({
            ...rows[0],
            entity_id: String(i),
          }));
    });
    const result = await loadAttention('account-a', 'appointments', 2, '', now);
    expect(result.items).toHaveLength(5);
    expect(result.hasMore).toBe(true);
    expect(select.mock.calls[1][0]).toContain(
      'ORDER BY priority,occurred_at DESC,kind,entity_id'
    );
    expect(select.mock.calls[1][1].slice(-3)).toEqual(['appointments', 6, 10]);
  });
  it('binds search as literal text and never interpolates account or user input into SQL', async () => {
    await loadAttention('account-a', 'all', 0, "25%_! ' OR 1=1", now);
    for (const [sql, values] of select.mock.calls) {
      expect(sql).not.toContain('OR 1=1');
      expect(sql).not.toContain('account-a');
      expect(values).toContain("%25!%!_!! ' OR 1=1%");
    }
  });
  it('does not turn a failed data source into a misleading all-clear result', async () => {
    select.mockRejectedValueOnce(Error('Database unavailable'));
    await expect(loadAttention('account-a', 'all', 0, '', now)).rejects.toThrow(
      'Database unavailable'
    );
  });
});
