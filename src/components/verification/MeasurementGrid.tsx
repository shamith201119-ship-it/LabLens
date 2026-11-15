import { FileSearch } from 'lucide-react'
import { ButtonLink } from '../Button'
import type { Measurement } from '../../lib/api'
import { MeasurementCard } from './MeasurementCard'

interface MeasurementGridProps {
  measurements: Measurement[]
  selectedIds: Set<string>
  onToggleSelect: (measurementId: string) => void
  onOpenSource: (measurement: Measurement) => void
  onEdit: (measurement: Measurement) => void
}

/**
 * Responsive measurement card grid. Three columns on large screens, two on
 * tablet/small desktop, one on phones. No nested scrolling: the page scrolls.
 */
export function MeasurementGrid({
  measurements,
  selectedIds,
  onToggleSelect,
  onOpenSource,
  onEdit,
}: MeasurementGridProps) {
  if (measurements.length === 0) {
    return (
      <div className="ve-empty">
        <FileSearch size={22} strokeWidth={1.6} aria-hidden="true" />
        <h2 className="ve-empty__title">No measurements were extracted</h2>
        <p className="ve-empty__copy">
          LabLens could not read any result rows from this report. The original
          file is preserved and can still be downloaded, and nothing has been
          analysed.
        </p>
        <ButtonLink to="/app/reports" variant="secondary" size="sm">
          Back to my reports
        </ButtonLink>
      </div>
    )
  }

  return (
    <ul className="ve-grid" aria-label="Extracted measurements">
      {measurements.map((measurement) => (
        <MeasurementCard
          key={measurement.id}
          measurement={measurement}
          isSelected={selectedIds.has(measurement.id)}
          onToggleSelect={onToggleSelect}
          onOpenSource={onOpenSource}
          onEdit={onEdit}
        />
      ))}
    </ul>
  )
}
