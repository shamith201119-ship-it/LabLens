import { ProgressRing } from './ProgressRing'
import type { ReviewSummary } from '../../lib/verification'

interface VerificationHeaderProps {
  summary: ReviewSummary
}

/**
 * Editorial overview strip: what this page is, what the review means,
 * and honest progress counters. Progress is derived from real state only.
 */
export function VerificationHeader({ summary }: VerificationHeaderProps) {
  return (
    <header className="ve-overview">
      <div className="ve-overview__copy">
        <p className="ve-eyebrow">Step 3 of 4 · Verify extracted results</p>
        <h1 className="ve-headline">
          Review your results
        </h1>
        <p className="ve-lede">
          LabLens has read your report. Let&apos;s make sure the results were copied
          correctly.
        </p>
        <p className="ve-honesty">
          You&apos;re checking whether the values were copied correctly — not
          deciding whether they are medically normal.
        </p>
      </div>

      <div className="ve-overview__panel" aria-label="Review progress">
        <ProgressRing
          fraction={summary.fraction}
          confirmed={summary.confirmed}
          total={summary.total}
        />
        <dl className="ve-counts">
          <div className="ve-counts__item">
            <dt>Total</dt>
            <dd>{summary.total}</dd>
          </div>
          <div className="ve-counts__item">
            <dt>Confirmed</dt>
            <dd>{summary.confirmed}</dd>
          </div>
          <div className="ve-counts__item">
            <dt>Need review</dt>
            <dd>{summary.needsReview}</dd>
          </div>
          <div className="ve-counts__item">
            <dt>Edited</dt>
            <dd>{summary.corrected}</dd>
          </div>
        </dl>
      </div>
    </header>
  )
}
