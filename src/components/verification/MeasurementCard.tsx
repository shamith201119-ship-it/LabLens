import { Check, Edit2, FileSearch } from 'lucide-react'
import type { Measurement } from '../../lib/api'
import { displayName, isConfirmed } from '../../lib/verification'

interface MeasurementCardProps {
  measurement: Measurement
  /** True when this measurement is selected for explicit confirmation. */
  isSelected: boolean
  onToggleSelect: (measurementId: string) => void
  /** Open the original report at this measurement's page, highlighting it. */
  onOpenSource: (measurement: Measurement) => void
  /** Open the correction flow for this measurement. */
  onEdit: (measurement: Measurement) => void
}

/**
 * One extracted measurement, reduced to the four things that matter during
 * verification: what it is, what was read, its unit, and whether it matches.
 * Selection is the primary interaction; source inspection and correction are
 * contextual actions that stay out of the way.
 */
export function MeasurementCard({
  measurement,
  isSelected,
  onToggleSelect,
  onOpenSource,
  onEdit,
}: MeasurementCardProps) {
  const name = displayName(measurement)
  const confirmed = isConfirmed(measurement)
  const page = measurement.page_number > 0 ? measurement.page_number : null
  const inputId = `ve-select-${measurement.id}`

  return (
    <li
      className={[
        've-card',
        isSelected ? 'is-selected' : '',
        confirmed ? 'is-confirmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-measurement-id={measurement.id}
      onClick={(event) => {
        // The label handles its own toggle. Any other non-action part of the
        // card (the foot, the padding) toggles too, so the whole card selects.
        const target = event.target
        if (!(target instanceof HTMLElement)) return
        if (target.closest('button, input, label, a')) return
        onToggleSelect(measurement.id)
      }}
    >
      <label className="ve-card__hit" htmlFor={inputId}>
        <span className="ve-card__top">
          <span className="ve-card__boxwrap">
            <input
              id={inputId}
              type="checkbox"
              className="ve-card__box"
              checked={isSelected}
              onChange={() => onToggleSelect(measurement.id)}
              aria-label={`Select ${name} for confirmation`}
            />
            <span className="ve-card__tick" aria-hidden="true">
              <Check size={14} strokeWidth={3.2} />
            </span>
          </span>
          {confirmed ? (
            <span className="ve-card__state">
              <Check size={12} strokeWidth={3} aria-hidden="true" />
              Confirmed
            </span>
          ) : null}
        </span>

        <span className="ve-card__name">{name}</span>

        <span className="ve-card__reading">
          <span className="ve-card__value">{measurement.result_original}</span>
          {measurement.unit_original ? (
            <span className="ve-card__unit">{measurement.unit_original}</span>
          ) : null}
        </span>
      </label>

      <div className="ve-card__foot">
        <span className="ve-card__meta">
          {page ? <span>p.{page}</span> : null}
          {measurement.has_corrections ? (
            <span className="ve-card__edited" title="Value edited after extraction">
              Edited
            </span>
          ) : null}
        </span>
        <span className="ve-card__actions">
          <button
            type="button"
            id={`ve-source-${measurement.id}`}
            className="ve-card__action"
            onClick={() => onOpenSource(measurement)}
          >
            <FileSearch size={13} aria-hidden="true" />
            View in report
          </button>
          <button
            type="button"
            id={`ve-edit-${measurement.id}`}
            className="ve-card__action"
            onClick={() => onEdit(measurement)}
          >
            <Edit2 size={13} aria-hidden="true" />
            Edit
          </button>
        </span>
      </div>
    </li>
  )
}
