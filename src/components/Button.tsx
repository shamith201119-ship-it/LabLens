import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cx } from '../lib/cx'
import { buttonClasses, type ButtonSize, type ButtonVariant } from '../lib/button'
import { Tooltip } from './Tooltip'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
  type = 'button',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, block, className)}
      {...props}
    >
      {children}
    </button>
  )
}

interface ButtonLinkProps extends LinkProps {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  children: ReactNode
}

export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(
  ({ variant = 'primary', size = 'md', block = false, className, children, ...props }, ref) => (
    <Link
      ref={ref}
      className={buttonClasses(variant, size, block, className)}
      {...props}
    >
      {children}
    </Link>
  ),
)

ButtonLink.displayName = 'ButtonLink'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  tooltip?: string
  size?: 'sm' | 'md'
  plain?: boolean
}

export function IconButton({
  label,
  tooltip,
  size = 'md',
  plain = false,
  className,
  type = 'button',
  children,
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      className={cx(
        'icon-btn',
        size === 'sm' && 'icon-btn--sm',
        plain && 'icon-btn--plain',
        className,
      )}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  )

  return tooltip ? <Tooltip label={tooltip}>{button}</Tooltip> : button
}
