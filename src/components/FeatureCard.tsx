import type { ReactNode } from 'react'
import { cx } from '../lib/cx'

interface FeatureCardProps {
  icon: ReactNode
  index?: string
  title: string
  description: ReactNode
  children?: ReactNode
  dark?: boolean
  className?: string
}

export function FeatureCard({
  icon,
  index,
  title,
  description,
  children,
  dark = false,
  className,
}: FeatureCardProps) {
  return (
    <article
      className={cx('feature-card', dark && 'feature-card--dark', className)}
    >
      <div className="feature-card__top">
        <span className="feature-card__icon" aria-hidden="true">
          {icon}
        </span>
        {index ? <span className="feature-card__index">{index}</span> : null}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </article>
  )
}
