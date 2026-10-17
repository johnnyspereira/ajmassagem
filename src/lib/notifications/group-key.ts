import type { Notification } from '@/types';

type Groupable = Pick<
  Notification,
  'id' | 'user_id' | 'type' | 'conversation_id' | 'contact_id' | 'action_url'
>;
export function notificationGroupKey(notification: Groupable) {
  if (
    notification.type === 'conversation_assigned' &&
    notification.conversation_id
  ) {
    return `assignment:${notification.conversation_id}:${notification.user_id}`;
  }
  if (notification.conversation_id)
    return `conversation:${notification.conversation_id}:${notification.type}`;
  if (notification.contact_id)
    return `contact:${notification.contact_id}:${notification.type}`;
  if (notification.type !== 'system_alert' && notification.action_url)
    return `situation:${notification.type}:${notification.action_url}`;
  return `single:${notification.id}`;
}
