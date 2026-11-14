import { cx } from './cx'

export type ButtonVariant =
  | 'primary'
  | 'lime'
  | 'secondary'
  | 'ghost'
  | 'quiet'
  | 'dark'
export type ButtonSize = 'sm' | 'md' | 'lg'

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  block = false,
  className?: string,
): string {
  return cx(
    'btn',
    `btn--${variant}`,
    size === 'sm' && 'btn--sm',
    size === 'lg' && 'btn--lg',
    block && 'btn--block',
    className,
  )
}
