import type { ReactNode } from 'react'
import { FileSearch, Search } from 'lucide-react'
import { Button } from '../Button'
import type { Measurement } from '../../lib/api'
import {
  applyFilter,
  summarize,
  type VerificationFilter,
} from '../../lib/verification'
import { FilterChips } from './FilterChips'
import { MeasurementRow } from './MeasurementRow'
import { SelectionBar } from './SelectionBar'
import { ShieldCheck } from 'lucide-react'

interface MeasurementWorkspaceProps {
  measurements: Measurement[]
  editingSlot?: ReactNode
  selectedIds: Set<string>
  onToggleSelect: (measurementId: string) => void
  onClearSelection: () => void
  confirmingSelected: boolean
  onConfirmSelected: () => void
  filter: VerificationFilter
  onFilterChange: (filter: VerificationFilter) => void
  search: string
  onSearchChange: (query: string) => void
  selectedMeasurementId: string | null
  onOpenInspection: (measurement: Measurement) => void
  onVerifyOne: (measurementId: string) => void
  onStartEdit: (measurement: Measurement) => void
  hiddenOnMobile: boolean
  continuing: boolean
  onConfirmAndContinue: () => void
}

export function MeasurementWorkspace({
  measurements,
  editingSlot,
  selectedIds,
  onToggleSelect,
  onClearSelection,
  confirmingSelected,
  onConfirmSelected,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  selectedMeasurementId,
  onOpenInspection,
  onVerifyOne,
  onStartEdit,
  hiddenOnMobile,
  continuing,
  onConfirmAndContinue,
}: MeasurementWorkspaceProps) {
  const summary = summarize(measurements)
  const filtered = applyFilter(measurements, filter, search)

  const filterItems = [
    { id: 'all' as const, label: 'All', count: measurements.length },
    { id: 'needs_review' as const, label: 'Needs review', count: summary.needsReview },
    { id: 'out_of_range' as const, label: 'Out of range', count: summary.outOfRange },
    { id: 'confirmed' as const, label: 'Confirmed', count: summary.confirmed },
    { id: 'corrected' as const, label: 'Corrected', count: summary.corrected },
  ]

  return (
    <section
      id="ve-panel-measurements"
      className={`ve-workspace${hiddenOnMobile ? ' ve-mobile-hidden' : ''}`}
      aria-label="Extracted measurements"
    >
      <div className="ve-workspace__head">
        <div>
          <h2 className="ve-workspace__title">Measurements</h2>
          <p className="ve-workspace__counter">
            {summary.confirmed} of {summary.total} confirmed
            {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ''}
          </p>
        </div>
        <p className="ve-workspace__hint">
          Select only the results you have checked against the original document.
        </p>
      </div>

      <div className="ve-workspace__tools">
        <FilterChips active={filter} onChange={onFilterChange} items={filterItems} />
        <label className="ve-search">
          <Search size={13} aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search name, unit or range…"
            aria-label="Search measurements"
          />
        </label>
      </div>

      {editingSlot ? <div className="ve-edit-slot">{editingSlot}</div> : null}

      <div className="ve-list">
        {filtered.length === 0 ? (
          <div className="ve-list__empty">
            <FileSearch size={20} strokeWidth={1.6} aria-hidden="true" />
            <p>No measurements match this filter.</p>
            <button
              type="button"
              className="ve-text-btn"
              onClick={() => {
                onFilterChange('all')
                onSearchChange('')
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          filtered.map((measurement) => (
            <MeasurementRow
              key={measurement.id}
              measurement={measurement}
              isInspected={measurement.id === selectedMeasurementId}
              isChecked={selectedIds.has(measurement.id)}
              onOpenInspection={onOpenInspection}
              onToggleCheck={onToggleSelect}
              onVerifyOne={onVerifyOne}
              onStartEdit={onStartEdit}
            />
          ))
        )}
        <SelectionBar
          selectedCount={selectedIds.size}
          confirming={confirmingSelected}
          onConfirm={onConfirmSelected}
          onClear={onClearSelection}
        />
      </div>

      <div className="ve-continue">
        <div className="ve-continue__info">
          <ShieldCheck size={14} strokeWidth={2} aria-hidden="true" />
          <span>
            {summary.needsReview > 0
              ? `${summary.needsReview} unconfirmed ${summary.needsReview === 1 ? 'result' : 'results'} won't be used in analysis unless you confirm them.`
              : 'All results are confirmed and will be used in analysis.'}
          </span>
        </div>
        <Button
          variant="lime"
          size="lg"
          onClick={onConfirmAndContinue}
          disabled={continuing}
          className="ve-continue__cta"
        >
          {continuing ? 'Analysing…' : 'Confirm results & continue'}
        </Button>
      </div>
    </section>
  )
}
