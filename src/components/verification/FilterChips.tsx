import type { VerificationFilter } from '../../lib/verification'

export interface FilterChipItem {
  id: VerificationFilter
  label: string
  count: number
}

interface FilterChipsProps {
  active: VerificationFilter
  onChange: (filter: VerificationFilter) => void
  items: FilterChipItem[]
}

export function FilterChips({ active, onChange, items }: FilterChipsProps) {
  return (
    <div className="ve-filters" role="group" aria-label="Filter measurements">
      {items.map((item) => {
        const isActive = item.id === active
        return (
          <button
            key={item.id}
            type="button"
            className={`ve-chip${isActive ? ' is-active' : ''}`}
            aria-pressed={isActive}
            onClick={() => onChange(item.id)}
          >
            <span className="ve-chip__label">{item.label}</span>
            <span className="ve-chip__count">{item.count}</span>
          </button>
        )
      })}
    </div>
  )
}
