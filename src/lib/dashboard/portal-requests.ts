export interface PortalRequestEvent {
  entity_id: string;
  action: string;
  metadata: unknown;
  new_starts_at: string | null;
}

/** Events must be newest first. A resolved request must never reappear. */
export function pendingPortalRequests(events: PortalRequestEvent[]) {
  const resolved = new Set<string>();
  const pending = new Map<string, PortalRequestEvent>();
  for (const event of events) {
    if (resolved.has(event.entity_id)) continue;
    let metadata = event.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        continue;
      }
    }
    const detail =
      metadata && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>)
        : {};
    if (detail.kind === 'portal_reschedule') {
      resolved.add(event.entity_id);
      if (detail.state === 'awaiting_professional')
        pending.set(event.entity_id, event);
    } else if (
      detail.portal_reschedule_approved === true ||
      ['rescheduled', 'schedule_changed', 'wrong_booking_moved'].includes(
        event.action
      ) ||
      detail.new_status === 'cancelled'
    ) {
      resolved.add(event.entity_id);
    }
  }
  return pending;
}
