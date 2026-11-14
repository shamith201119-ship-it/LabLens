import type { ReactNode } from 'react'

interface TooltipProps {
  label: string
  children: ReactNode
}

export function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className="tooltip">
      {children}
      <span className="tooltip__bubble" role="tooltip" aria-hidden="true">
        {label}
      </span>
    </span>
  )
}
