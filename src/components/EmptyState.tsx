import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
  secondaryAction?: ReactNode
  footnote?: ReactNode
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  footnote,
  className,
}: EmptyStateProps) {
  return (
    <div className={cx('empty-state', className)}>
      <div className="empty-state__icon" aria-hidden="true">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action || secondaryAction ? (
        <div className="empty-state__actions">
          {action}
          {secondaryAction}
        </div>
      ) : null}
      {footnote ? <div className="empty-state__footnote">{footnote}</div> : null}
    </div>
  )
}
