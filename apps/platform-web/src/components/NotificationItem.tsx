import { useNavigate } from 'react-router-dom';
import type { Notification } from './notificationTypes';
import { formatDateTime } from './shared';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: () => void;
  onDelete: () => void;
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
}: NotificationItemProps) {
  const navigate = useNavigate();

  function handleClick() {
    if (!notification.read) {
      onMarkAsRead();
    }
    if (notification.actionUrl) {
      navigate(notification.actionUrl);
    }
  }

  return (
    <article
      className={`notification-item ${notification.read ? 'read' : 'unread'}`}
      role="article"
      aria-label={`通知: ${notification.title}`}
    >
      <div className="notification-icon">{notification.icon || '📬'}</div>

      <div className="notification-content">
        <div className="notification-header">
          <h3 className="notification-title">{notification.title}</h3>
          {!notification.read && (
            <span className="unread-badge" aria-label="未读" title="未读">
              ●
            </span>
          )}
        </div>
        <p className="notification-message">{notification.message}</p>
        <div className="notification-meta">
          <time className="notification-time" dateTime={notification.createdAt}>
            {formatDateTime(notification.createdAt)}
          </time>
          <span className="notification-category">{notification.category}</span>
        </div>
      </div>

      <div className="notification-actions">
        {notification.actionUrl && notification.actionLabel && (
          <button
            className="btn-action"
            onClick={handleClick}
            aria-label={notification.actionLabel}
          >
            {notification.actionLabel}
          </button>
        )}
        {!notification.read && (
          <button
            className="btn-mark-read"
            onClick={onMarkAsRead}
            aria-label="标记为已读"
            title="标记为已读"
          >
            标记已读
          </button>
        )}
        <button
          className="btn-delete"
          onClick={onDelete}
          aria-label="删除通知"
          title="删除通知"
        >
          删除
        </button>
      </div>
    </article>
  );
}
