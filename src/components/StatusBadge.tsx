import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

export type StatusVariant =
  | 'neutral'
  | 'mint'
  | 'lime'
  | 'amber'
  | 'critical'
  | 'dark'
  | 'outline'

interface StatusBadgeProps {
  children: ReactNode
  variant?: StatusVariant
  dot?: boolean
  className?: string
}

export function StatusBadge({
  children,
  variant = 'neutral',
  dot = true,
  className,
}: StatusBadgeProps) {
  return (
    <span className={cx('status-badge', `status-badge--${variant}`, className)}>
      {dot ? <span className="status-badge__dot" aria-hidden="true" /> : null}
      {children}
    </span>
  )
}
