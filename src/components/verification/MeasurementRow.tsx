import { Check, Edit2 } from 'lucide-react'
import type { Measurement } from '../../lib/api'
import {
  displayName,
  isCritical,
  isConfirmed,
  isOutOfRange,
  rangeFlagLabel,
} from '../../lib/verification'

interface MeasurementRowProps {
  measurement: Measurement
  /** True when this row is the selected source-document inspection measurement. */
  isInspected: boolean
  /** True when the row's confirmation checkbox is checked (bulk selection). */
  isChecked: boolean
  onOpenInspection: (measurement: Measurement) => void
  onToggleCheck: (measurementId: string) => void
  onVerifyOne: (measurementId: string) => void
  onStartEdit: (measurement: Measurement) => void
}

/**
 * Editorial measurement row.
 * Row click = inspection. Checkbox = explicit bulk-confirmation selection.
 */
export function MeasurementRow({
  measurement,
  isInspected,
  isChecked,
  onOpenInspection,
  onToggleCheck,
  onVerifyOne,
  onStartEdit,
}: MeasurementRowProps) {
  const confirmed = isConfirmed(measurement)
  const outOfRange = isOutOfRange(measurement)
  const critical = isCritical(measurement)
  const flagLabel = rangeFlagLabel(measurement)
  const name = displayName(measurement)

  return (
    <div
      className={[
        've-row',
        confirmed ? 'is-confirmed' : '',
        isInspected ? 'is-inspected' : '',
        outOfRange ? 'is-out-of-range' : '',
        critical ? 'is-critical' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <label
        className="ve-row__select"
        htmlFor={`confirm-select-${measurement.id}`}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          id={`confirm-select-${measurement.id}`}
          type="checkbox"
          className="ve-checkbox"
          checked={isChecked}
          onChange={() => onToggleCheck(measurement.id)}
          aria-label={`Select ${name} for confirmation`}
        />
      </label>

      <button
        type="button"
        className="ve-row__body"
        data-measurement-id={measurement.id}
        onClick={() => onOpenInspection(measurement)}
        aria-pressed={isInspected}
        aria-label={`Inspect ${name}`}
      >
        <span className="ve-row__name-cell">
          <span className="ve-row__name" title={name}>
            {name}
          </span>
          <span className="ve-row__meta">
            {measurement.page_number ? (
              <span className="ve-row__page">p.{measurement.page_number}</span>
            ) : null}
            {measurement.has_corrections ? (
              <span className="ve-row__edited" title="This value was edited after extraction">
                Edited
              </span>
            ) : null}
            {critical ? (
              <span className="ve-row__critical">Critical flag</span>
            ) : null}
            {measurement.test_name_normalized !== measurement.test_name_original ? (
              <span className="ve-row__original">was: {measurement.test_name_original}</span>
            ) : null}
          </span>
          {flagLabel ? (
            <span className="ve-row__flag">{flagLabel}</span>
          ) : null}
        </span>

        <span className="ve-row__value">
          <span className="ve-row__value-main">
            {measurement.result_original}
            {measurement.unit_original ? (
              <span className="ve-row__unit">{measurement.unit_original}</span>
            ) : null}
          </span>
        </span>

        <span className="ve-row__range">
          {measurement.reference_range_original ? (
            measurement.reference_range_original
          ) : (
            <span className="ve-row__muted">—</span>
          )}
        </span>

        <span
          className="ve-row__status"
          title={confirmed ? 'Confirmed' : 'Needs review'}
        >
          {confirmed ? (
            <>
              <span className="ve-status-dot ve-status-dot--ok" aria-hidden="true">
                <Check size={11} strokeWidth={3} />
              </span>
              <span className="ve-row__status-label">Confirmed</span>
            </>
          ) : (
            <>
              <span className="ve-status-dot ve-status-dot--pending" aria-hidden="true" />
              <span className="ve-row__status-label">Needs review</span>
            </>
          )}
        </span>
      </button>

      <div
        className="ve-row__actions"
        onClick={(event) => event.stopPropagation()}
      >
        {confirmed ? null : (
          <button
            type="button"
            className="ve-icon-btn ve-icon-btn--confirm"
            onClick={() => onVerifyOne(measurement.id)}
            title="Confirm this result"
            aria-label={`Confirm ${name}`}
          >
            <Check size={13} strokeWidth={2.5} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="ve-icon-btn"
          onClick={() => onStartEdit(measurement)}
          title="Edit value, unit or reference range"
          aria-label={`Edit ${name}`}
        >
          <Edit2 size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
