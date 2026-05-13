export type NotificationCategory = '技能相关' | '系统';

export interface Notification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  read: boolean;
  createdAt: string;
  actionUrl?: string;
  actionLabel?: string;
  icon?: string;
}
