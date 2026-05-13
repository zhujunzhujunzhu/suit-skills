import React from 'react';

export type EmptyStateType = 'no-data' | 'no-results' | 'error' | 'loading';

export interface EmptyStateProps {
  type?: EmptyStateType;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  ariaLabel?: string;
}

const defaultIcons: Record<EmptyStateType, React.ReactNode> = {
  'no-data': (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" opacity="0.2" />
      <path d="M24 14V34M14 24H34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  'no-results': (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M28 28L36 36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 20H24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  ),
  'error': (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" fill="none" />
      <path d="M24 16V28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="34" r="1.5" fill="currentColor" />
    </svg>
  ),
  'loading': (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.2" />
      <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="31.4 94.2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }} />
    </svg>
  ),
};

export function EmptyState({
  type = 'no-data',
  icon,
  title,
  description,
  action,
  className = '',
  ariaLabel,
}: EmptyStateProps) {
  const displayIcon = icon ?? defaultIcons[type];
  const role = type === 'loading' ? 'status' : 'region';
  const ariaLive = type === 'loading' ? 'polite' : undefined;

  return (
    <div
      className={`empty-state empty-state-${type} ${className}`}
      role={role}
      aria-live={ariaLive}
      aria-label={ariaLabel}
    >
      <div className="empty-state-icon">
        {displayIcon}
      </div>
      <div className="empty-state-content">
        <h3 className="empty-state-title">{title}</h3>
        {description && (
          <p className="empty-state-description">{description}</p>
        )}
      </div>
      {action && (
        <button
          className="empty-state-action btn-primary"
          onClick={action.onClick}
          aria-label={`${action.label}: ${title}`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
