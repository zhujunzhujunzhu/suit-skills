import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUnreadCount } from './notificationService';

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    // Initial load
    setUnreadCount(getUnreadCount());

    // Set up a listener for storage changes (for cross-tab updates)
    function handleStorageChange() {
      setUnreadCount(getUnreadCount());
    }

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
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
