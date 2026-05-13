import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUnreadCount } from './notificationService';

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    async function loadUnreadCount() {
      const count = await getUnreadCount();
      setUnreadCount(count);
    }

    loadUnreadCount();

    const interval = setInterval(loadUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  function handleClick() {
    navigate('/notifications');
  }

  return (
    <button
      className="notification-bell"
      onClick={handleClick}
      aria-label={`通知 ${unreadCount > 0 ? `(${unreadCount}条未读)` : ''}`}
      title={`通知 ${unreadCount > 0 ? `(${unreadCount}条未读)` : ''}`}
    >
      <span className="bell-icon">🔔</span>
      {unreadCount > 0 && (
        <span className="notification-badge" aria-label={`${unreadCount}条未读通知`}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
}
