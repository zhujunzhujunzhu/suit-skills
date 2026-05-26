import type { Notification } from './notificationTypes';
import * as api from '../api/client';

function notificationFromApi(record: api.NotificationRecord): Notification {
  return {
    id: record.id,
    title: record.title,
    message: record.message,
    category: record.type === 'system' ? '系统' : '技能相关',
    read: record.isRead,
    createdAt: record.createdAt,
    actionUrl: record.actionUrl,
    actionLabel: record.actionUrl ? '查看详情' : undefined,
    icon: record.type === 'skill_reviewed' ? '⭐' : record.type === 'skill_status_changed' ? '✅' : record.type === 'skill_comment' ? '💬' : '🔔',
  };
}

export async function getNotifications(): Promise<Notification[]> {
  try {
    const response = await api.listNotifications(1, 50);
    return response.data.map(notificationFromApi).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

export async function getUnreadCount(): Promise<number> {
  try {
    const response = await api.getUnreadCount();
    return response.unreadCount;
  } catch {
    return 0;
  }
}

export async function markAsRead(id: string): Promise<void> {
  await api.markNotificationAsRead(id, true);
}

export async function deleteNotification(id: string): Promise<void> {
  await api.deleteNotification(id);
}

export function addNotification(notification: Omit<Notification, 'id' | 'read' | 'createdAt'>): Notification {
  return {
    ...notification,
    id: `notif-${Date.now()}`,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

export async function clearAllNotifications(): Promise<void> {
  return;
}
