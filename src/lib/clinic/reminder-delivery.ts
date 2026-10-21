type Channel = { sent?: boolean; queued?: boolean; error?: string | null };
type Attempt = {
  entity_id: string;
  action: string;
  created_at: string;
  metadata: unknown;
};
export function reminderDelivery(id: string, events: Attempt[]) {
  for (const event of events
    .filter(
      (event) => event.entity_id === id && event.action === 'message_sent'
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    try {
      const meta =
        typeof event.metadata === 'string'
          ? JSON.parse(event.metadata)
          : event.metadata;
      if (
        !meta ||
        !['reminder', 'pending_confirmation'].includes(meta.message_action)
      )
        continue;
      const channels = meta.deliveries as
        { whatsapp?: Channel; email?: Channel } | undefined;
      return {
        sent: Boolean(channels?.whatsapp?.sent || channels?.email?.sent),
        queued: Boolean(channels?.whatsapp?.queued),
        whatsapp: channels?.whatsapp,
        email: channels?.email,
      };
    } catch {
      /* Invalid historical metadata is not evidence of delivery. */
    }
  }
  return { sent: false, queued: false, whatsapp: undefined, email: undefined };
}
