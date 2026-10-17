import { describe, expect, it } from 'vitest';
import {
  navigationGroups,
  navigationLinks,
  activeNavigation,
  groupLinks,
} from './navigation-model';
describe('navigation architecture', () => {
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
