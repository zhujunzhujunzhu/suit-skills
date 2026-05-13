import { useEffect, useState } from 'react';
import { PageHeader } from './shared';
import { NotificationItem } from './NotificationItem';
import { EmptyState } from './EmptyState';
import type { Notification } from './notificationTypes';
import { getNotifications, markAsRead, deleteNotification, getUnreadCount } from './notificationService';

type NotificationCategory = '全部' | '技能相关' | '系统';

const ITEMS_PER_PAGE = 10;

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [category, setCategory] = useState<NotificationCategory>('全部');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, []);

  function loadNotifications() {
    setLoading(true);
    try {
      const allNotifications = getNotifications();
      setNotifications(allNotifications);
    } finally {
      setLoading(false);
    }
  }

  function handleMarkAsRead(id: string) {
    markAsRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }

  function handleDelete(id: string) {
    deleteNotification(id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  function handleMarkAllAsRead() {
    notifications.forEach((n) => {
      if (!n.read) {
        markAsRead(n.id);
      }
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  const filteredNotifications =
    category === '全部'
      ? notifications
      : notifications.filter((n) => n.category === category);

  const totalPages = Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedNotifications = filteredNotifications.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Notifications"
        title="通知中心"
        description="查看和管理您的通知，包括技能相关和系统消息。"
        actions={
          unreadCount > 0 ? (
            <button
              className="btn-primary"
              onClick={handleMarkAllAsRead}
              aria-label="标记全部为已读"
            >
              标记全部为已读
            </button>
          ) : null
        }
      />

      <section className="notification-filters">
        <div className="filter-group" role="tablist" aria-label="通知分类">
          {(['全部', '技能相关', '系统'] as const).map((cat) => (
            <button
              key={cat}
              className={`filter-btn ${category === cat ? 'active' : ''}`}
              onClick={() => {
                setCategory(cat);
                setCurrentPage(1);
              }}
              role="tab"
              aria-selected={category === cat}
              aria-controls="notification-list"
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      <section className="notification-list" id="notification-list" role="region" aria-live="polite" aria-label="通知列表">
        {loading ? (
          <EmptyState
            type="loading"
            title="加载中..."
            ariaLabel="正在加载通知"
          />
        ) : paginatedNotifications.length === 0 ? (
          <EmptyState
            type={notifications.length === 0 ? 'no-data' : 'no-results'}
            title={notifications.length === 0 ? '暂无通知' : `${category}分类下暂无通知`}
            description={
              notifications.length === 0
                ? '当有新的技能更新或系统消息时，会在这里显示。'
                : '切换分类查看其他通知。'
            }
            ariaLabel={notifications.length === 0 ? '没有通知' : `${category}分类下没有通知`}
          />
        ) : (
          <>
            {paginatedNotifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={() => handleMarkAsRead(notification.id)}
                onDelete={() => handleDelete(notification.id)}
              />
            ))}
          </>
        )}
      </section>

      {totalPages > 1 && (
        <section className="pagination" aria-label="通知分页">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => p - 1)}
            aria-label={`上一页 (当前第 ${currentPage} 页)`}
          >
            上一页
          </button>
          <span className="page-info" aria-live="polite" aria-atomic="true">
            第 {currentPage} / {totalPages} 页
          </span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => p + 1)}
            aria-label={`下一页 (当前第 ${currentPage} 页)`}
          >
            下一页
          </button>
        </section>
      )}
    </div>
  );
}
