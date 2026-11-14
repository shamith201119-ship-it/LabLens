import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

interface PageContainerProps {
  children: ReactNode
  className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
  return <div className={cx('page-container', className)}>{children}</div>
}

interface PageHeaderProps {
  title: string
  eyebrow?: string
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cx('page-header', className)}>
      <div className="page-header__copy">
        {eyebrow ? <p className="page-header__eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? (
          <p className="page-header__description">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  )
}
