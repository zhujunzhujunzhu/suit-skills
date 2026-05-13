import type { Notification } from './notificationTypes';

const NOTIFICATIONS_STORAGE_KEY = 'suit-skills-notifications';
const NOTIFICATION_READ_KEY = 'suit-skills-notification-read';

// Mock data for demonstration
const mockNotifications: Notification[] = [
  {
    id: 'notif-1',
    title: '技能更新通知',
    message: 'frontend-design 已更新到 2.2.1 版本，包含新的组件库和性能优化。',
    category: '技能相关',
    read: false,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    actionUrl: '/skills/skill-frontend-design',
    actionLabel: '查看详情',
    icon: '📦',
  },
  {
    id: 'notif-2',
    title: '系统维护通知',
    message: '平台将于今晚 22:00-23:00 进行系统维护，期间可能无法访问。',
    category: '系统',
    read: false,
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    icon: '🔧',
  },
  {
    id: 'notif-3',
    title: '评价反馈',
    message: '您上传的技能 java-bugfix-workflow 收到了新的用户评价。',
    category: '技能相关',
    read: true,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    actionUrl: '/reviews',
    actionLabel: '查看评价',
    icon: '⭐',
  },
  {
    id: 'notif-4',
    title: '审核通过',
    message: '您上传的技能包 docx 已通过审核，现已发布到技能市场。',
    category: '技能相关',
    read: true,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    actionUrl: '/market',
    actionLabel: '查看市场',
    icon: '✅',
  },
  {
    id: 'notif-5',
    title: '新功能发布',
    message: '通知中心现已上线，您可以在这里管理所有的系统通知和技能更新。',
    category: '系统',
    read: true,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    icon: '🎉',
  },
];

function initializeNotifications(): Notification[] {
  if (typeof localStorage === 'undefined') {
    return mockNotifications;
  }

  const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return mockNotifications;
    }
  }

  // Initialize with mock data
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(mockNotifications));
  return mockNotifications;
}

export function getNotifications(): Notification[] {
  return initializeNotifications().sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getUnreadCount(): number {
  return getNotifications().filter((n) => !n.read).length;
}

export function markAsRead(id: string): void {
  if (typeof localStorage === 'undefined') return;

  const notifications = getNotifications();
  const updated = notifications.map((n) =>
    n.id === id ? { ...n, read: true } : n
  );
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
}

export function deleteNotification(id: string): void {
  if (typeof localStorage === 'undefined') return;

  const notifications = getNotifications();
  const updated = notifications.filter((n) => n.id !== id);
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
}

export function addNotification(notification: Omit<Notification, 'id' | 'read' | 'createdAt'>): Notification {
  if (typeof localStorage === 'undefined') {
    return {
      ...notification,
      id: `notif-${Date.now()}`,
      read: false,
      createdAt: new Date().toISOString(),
    };
  }

  const newNotification: Notification = {
    ...notification,
    id: `notif-${Date.now()}`,
    read: false,
    createdAt: new Date().toISOString(),
  };

  const notifications = getNotifications();
  const updated = [newNotification, ...notifications];
  localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));

  return newNotification;
}

export function clearAllNotifications(): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
}
