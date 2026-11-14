import { CheckCheck, X } from 'lucide-react'

interface SelectionBarProps {
  selectedCount: number
  confirming: boolean
  onConfirm: () => void
  onClear: () => void
}

/**
 * Persistent contextual bar shown when measurements are explicitly selected.
 * The only way to bulk-confirm. There is deliberately no select-all control.
 */
export function SelectionBar({
  selectedCount,
  confirming,
  onConfirm,
  onClear,
}: SelectionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="ve-selection-bar" role="status" aria-live="polite">
      <div className="ve-selection-bar__meta">
        <span className="ve-selection-bar__count">{selectedCount}</span>
        <span className="ve-selection-bar__text">
          {selectedCount === 1 ? 'result selected' : 'results selected'}
        </span>
        <button
          type="button"
          className="ve-selection-bar__clear"
          onClick={onClear}
          aria-label="Clear selection"
        >
          <X size={11} aria-hidden="true" />
          Clear
        </button>
      </div>
      <button
        type="button"
        className="ve-btn ve-btn--confirm"
        onClick={onConfirm}
        disabled={confirming}
      >
        <CheckCheck size={14} aria-hidden="true" />
        {confirming ? 'Confirming…' : `Confirm selected (${selectedCount})`}
      </button>
    </div>
  )
}
