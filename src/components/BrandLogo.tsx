import { Link } from 'react-router-dom'
import { cx } from '../lib/cx'

type BrandTheme = 'light' | 'dark'
type BrandSize = 'md' | 'sm'

interface BrandLogoProps {
  to?: string
  theme?: BrandTheme
  size?: BrandSize
  showWordmark?: boolean
  className?: string
}

function BrandMark({ theme }: { theme: BrandTheme }) {
  const tile = theme === 'dark' ? '#C9F277' : '#12251F'
  const ring = theme === 'dark' ? '#12251F' : '#C9F277'
  const dot = theme === 'dark' ? '#12251F' : '#78CFC0'

  return (
    <svg
      className="brand__mark"
      viewBox="0 0 36 36"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="36" height="36" rx="11" fill={tile} />
      <circle cx="18" cy="18" r="8.4" fill="none" stroke={ring} strokeWidth="2.5" />
      <circle cx="23" cy="13" r="2.6" fill={dot} />
    </svg>
  )
}

export function BrandLogo({
  to = '/',
  theme = 'light',
  size = 'md',
  showWordmark = true,
  className,
}: BrandLogoProps) {
  const classes = cx(
    'brand',
    theme === 'dark' && 'brand--dark',
    size === 'sm' && 'brand--sm',
    className,
  )

  const content = (
    <>
      <BrandMark theme={theme} />
      {showWordmark ? (
        <span className="brand__word">
          Lab<span>Lens</span>
        </span>
      ) : null}
    </>
  )

  return (
    <Link to={to} className={classes} aria-label="LabLens home">
      {content}
    </Link>
  )
}
