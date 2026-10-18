import { describe, expect, it } from 'vitest';
import {
  navigationGroups,
  navigationLinks,
  activeNavigation,
  groupLinks,
  searchableGroupLinks,
} from './navigation-model';
describe('navigation architecture', () => {
  it('finds WhatsApp conversations and configuration by the words users type', () => {
    expect(
      searchableGroupLinks('daily', 'Whatsapp').map((item) => item.href)
    ).toContain('/inbox');
    expect(
      searchableGroupLinks('system', 'whatsapp configuração').map(
        (item) => item.href
      )
    ).toContain('/settings?tab=whatsapp');
    expect(
      searchableGroupLinks('daily', 'CALENDÁRIO').map((item) => item.href)
    ).toContain('/agenda');
    expect(
      searchableGroupLinks('business', 'pagamentos').map((item) => item.href)
    ).toContain('/finance');
    expect(searchableGroupLinks('daily', 'xyz inexistente')).toEqual([]);
    expect(
      searchableGroupLinks('business', 'leads').map((item) => item.href)
    ).toContain('/leads');
    expect(activeNavigation('/leads')?.label).toBe('Leads');
  });
  it('includes every tool once and keeps notifications out of navigation groups', () => {
    const hrefs = navigationGroups.flatMap((group) => group.hrefs);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).not.toContain('/notifications');
    expect(new Set(navigationLinks.map((item) => item.href))).toEqual(
      new Set(hrefs)
    );
    for (const group of navigationGroups)
      expect(groupLinks(group.id)).toHaveLength(group.hrefs.length);
  });
  it('selects the most specific page without matching unrelated prefixes', () => {
    expect(activeNavigation('/business-hub/goals')?.href).toBe(
      '/business-hub/goals'
    );
    expect(activeNavigation('/contacts/client-1')?.href).toBe('/contacts');
    expect(activeNavigation('/contacts-extra')).toBeUndefined();
  });
});
