import { Button } from '../Button'

interface ConfirmBarProps {
  selectedCount: number
  /** Measurements still waiting for review. */
  needsReview: number
  total: number
  busy: boolean
  /** Confirm exactly the selected measurements, then enter completion. */
  onConfirmSelected: () => void
  /** Only offered when every measurement is already confirmed. */
  onContinue: () => void
}

/**
 * The single confirmation action for the whole page. There is no second
 * footer button and no inline per-card confirm control: selection is the
 * user's explicit statement that these values match the report.
 */
export function ConfirmBar({
  selectedCount,
  needsReview,
  total,
  busy,
  onConfirmSelected,
  onContinue,
}: ConfirmBarProps) {
  const allConfirmed = total > 0 && needsReview === 0
  const label =
    selectedCount > 0
      ? `Confirm ${selectedCount} ${selectedCount === 1 ? 'result' : 'results'} & continue`
      : allConfirmed
        ? 'Continue to your results'
        : 'Select at least one result to continue'

  const enabled = selectedCount > 0 || allConfirmed

  const hint =
    selectedCount > 0
      ? needsReview > 0
        ? `${needsReview} ${needsReview === 1 ? 'result' : 'results'} still unverified`
        : 'All results are already confirmed'
      : allConfirmed
        ? `All ${total} ${total === 1 ? 'result is' : 'results are'} confirmed`
        : 'Unselected results stay unverified and out of analysis'

  return (
    <div className="ve-confirmbar">
      <div className="ve-confirmbar__inner">
        <p className="ve-confirmbar__meta">
          <span className="ve-confirmbar__count" role="status" aria-live="polite">
            {allConfirmed && selectedCount === 0 ? (
              <>
                <strong>{total}</strong> of {total} confirmed
              </>
            ) : (
              <>
                <strong>{selectedCount}</strong> selected
              </>
            )}
          </span>
          <span className="ve-confirmbar__hint">{hint}</span>
        </p>
        <Button
          variant="lime"
          size="md"
          className="ve-confirmbar__cta"
          disabled={!enabled || busy}
          onClick={selectedCount > 0 ? onConfirmSelected : onContinue}
        >
          {busy ? 'Confirming…' : label}
        </Button>
      </div>
    </div>
  )
}
