import { describe, expect, it } from 'vitest';
import {
  pendingPortalRequests,
  type PortalRequestEvent,
} from './portal-requests';

const request: PortalRequestEvent = {
  entity_id: 'a',
  action: 'status_changed',
  metadata: { kind: 'portal_reschedule', state: 'awaiting_professional' },
  new_starts_at: '2026-10-20T12:00:00Z',
};
describe('pending portal requests', () => {
  it('removes requests already rescheduled in the agenda', () => {
    expect(
      pendingPortalRequests([
        { ...request, action: 'rescheduled', metadata: {} },
        request,
      ]).size
    ).toBe(0);
  });
  it('keeps a new request after an earlier approval', () => {
    expect(
      pendingPortalRequests([
        request,
        { ...request, action: 'rescheduled', metadata: {} },
      ]).size
    ).toBe(1);
  });
  it('ignores unrelated messages and reads JSON metadata', () => {
    expect(
      pendingPortalRequests([
        { ...request, action: 'message_sent', metadata: {} },
        { ...request, metadata: JSON.stringify(request.metadata) },
      ]).size
    ).toBe(1);
  });
  it('does not resurrect a rejected or approved request', () => {
    expect(
      pendingPortalRequests([
        {
          ...request,
          metadata: { kind: 'portal_reschedule', state: 'resolved' },
        },
        request,
      ]).size
    ).toBe(0);
  });
});
