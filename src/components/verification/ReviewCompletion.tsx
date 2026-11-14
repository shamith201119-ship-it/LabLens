import { useEffect, useState, useRef } from 'react'
import { ArrowLeft, ArrowRight, CheckCheck, FileCheck2, TriangleAlert } from 'lucide-react'
import { Button } from '../Button'
import type { ReviewSummary } from '../../lib/verification'

interface ReviewCompletionProps {
  summary: ReviewSummary
  /** Names of measurements not yet confirmed (capped display). */
  unverifiedNames: string[]
  unverifiedCount: number
  onReturnToReview: () => void
  /** Full-review primary CTA: proceeds through the existing analysis flow. */
  onContinueToResults: () => void
  continuing: boolean
}

const ACK_TEXT =
  'I understand that these measurements will remain unverified and will not be included in the analysis.'

/**
 * Completion moment at the end of the review journey.
 * Two honest states: every result confirmed, or some left deliberately
 * unverified behind an explicit acknowledgement. Acknowledgement never
 * changes verification state — it only permits leaving the review.
 */
export function ReviewCompletion({
  summary,
  unverifiedNames,
  unverifiedCount,
  onReturnToReview,
  onContinueToResults,
  continuing,
}: ReviewCompletionProps) {
  const fullyVerified = summary.needsReview === 0 && summary.total > 0
  const targetFraction = fullyVerified ? 1 : summary.fraction
  const [acknowledged, setAcknowledged] = useState(false)
  const [ringProgress, setRingProgress] = useState(() =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? targetFraction
      : 0,
  )
  const [entered, setEntered] = useState(false)
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    headingRef.current?.focus()
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    if (!entered) return
    const timer = window.setTimeout(() => setRingProgress(targetFraction), 90)
    return () => window.clearTimeout(timer)
    // Ring animates once on entry; fraction does not change while this view is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entered])

  const radius = 62
  const stroke = 9
  const size = 148
  const center = size / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, ringProgress))
  const dashOffset = circumference * (1 - clamped)
  const shownNames = unverifiedNames.slice(0, 5)
  const hiddenCount = unverifiedCount - shownNames.length

  return (
    <section className="rc" aria-labelledby="rc-heading" role="region">
      <div className="rc__inner">
        <div className={`rc__ring-wrap${fullyVerified ? ' is-complete' : ''}`} aria-hidden="true">
          <svg
            className="rc__ring"
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            role="presentation"
          >
            <circle className="rc__ring-track" cx={center} cy={center} r={radius} strokeWidth={stroke} fill="none" />
            <circle
              className="rc__ring-value"
              cx={center}
              cy={center}
              r={radius}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${center} ${center})`}
            />
            <text x="50%" y="46%" className="rc__ring-number" textAnchor="middle" dominantBaseline="middle">
              {fullyVerified ? '✓' : `${Math.round(summary.fraction * 100)}%`}
            </text>
            <text x="50%" y="63%" className="rc__ring-caption" textAnchor="middle" dominantBaseline="middle">
              {fullyVerified ? 'reviewed' : 'confirmed'}
            </text>
          </svg>
        </div>

        {fullyVerified ? (
          <>
            <p className="ve-eyebrow">Review complete</p>
            <h1 className="rc__headline" id="rc-heading" tabIndex={-1} ref={headingRef}>
              Your report review is complete.
            </h1>
            <p className="rc__lede">
              You&apos;ve checked the extracted results against your original laboratory
              report. LabLens can now use the verified measurements for its analysis.
            </p>

            <dl className="rc__stats" aria-label="Review summary">
              <div className="rc__stat">
                <dt>Total reviewed</dt>
                <dd>{summary.total}</dd>
              </div>
              <div className="rc__stat">
                <dt>Confirmed</dt>
                <dd>{summary.confirmed}</dd>
              </div>
              <div className="rc__stat">
                <dt>Corrected</dt>
                <dd>{summary.corrected}</dd>
              </div>
            </dl>

            <div className="rc__next">
              <h2 className="rc__next-title">What happens next</h2>
              <ol className="rc__next-steps">
                <li>
                  LabLens compares the confirmed results with laboratory reference
                  intervals and looks for patterns in your report.
                </li>
                <li>
                  You&apos;ll see the results with plain-language explanations. This is not
                  a diagnosis, and LabLens does not approve or clear any medical result —
                  your clinician always makes those decisions.
                </li>
                <li>
                  Only confirmed results are used. Anything you left unverified stays out
                  of the analysis.
                </li>
              </ol>
            </div>

            <Button
              variant="lime"
              size="lg"
              onClick={onContinueToResults}
              disabled={continuing}
              className="rc__cta"
            >
              {continuing ? 'Preparing your results…' : 'Continue to your results'}
              {!continuing ? <ArrowRight size={16} aria-hidden="true" /> : null}
            </Button>
            <button type="button" className="rc__back" onClick={onReturnToReview}>
              <ArrowLeft size={13} aria-hidden="true" />
              Back to review
            </button>
          </>
        ) : (
          <>
            <p className="ve-eyebrow rc__eyebrow--partial">Partially reviewed</p>
            <h1 className="rc__headline" id="rc-heading" tabIndex={-1} ref={headingRef}>
              You&apos;ve reviewed what you could.
            </h1>
            <p className="rc__lede">
              {summary.confirmed} of {summary.total} results are confirmed and{' '}
              {summary.corrected} {summary.corrected === 1 ? 'was' : 'were'} corrected.{' '}
              {unverifiedCount} {unverifiedCount === 1 ? 'result remains' : 'results remain'}{' '}
              unverified.
            </p>

            <dl className="rc__stats rc__stats--partial" aria-label="Review summary">
              <div className="rc__stat">
                <dt>Confirmed</dt>
                <dd>{summary.confirmed}</dd>
              </div>
              <div className="rc__stat">
                <dt>Corrected</dt>
                <dd>{summary.corrected}</dd>
              </div>
              <div className="rc__stat rc__stat--warn">
                <dt>Still unverified</dt>
                <dd>{unverifiedCount}</dd>
              </div>
            </dl>

            <div className="rc__exclusion" role="note">
              <div className="rc__exclusion-head">
                <TriangleAlert size={15} strokeWidth={2} aria-hidden="true" />
                <strong>Unverified results are not used in analysis</strong>
              </div>
              <p>
                LabLens will not treat these measurements as confirmed. They stay out of
                patterns, comparisons and explanations — both now and on every future
                analysis of this report. They remain visible in your report and you can
                come back and confirm them at any time.
              </p>
              {shownNames.length > 0 ? (
                <ul className="rc__unverified" aria-label="Measurements not confirmed">
                  {shownNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                  {hiddenCount > 0 ? <li>and {hiddenCount} more</li> : null}
                </ul>
              ) : null}
            </div>

            <label className="rc__ack">
              <input
                type="checkbox"
                className="rc__ack-box"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              <span>{ACK_TEXT}</span>
            </label>
            <p className="rc__ack-note">
              Ticking this box does not confirm, verify or change any measurement. The
              unverified results keep their current status and their audit records are
              preserved.
            </p>

            <div className="rc__actions">
              <button
                type="button"
                className="rc__secondary"
                onClick={onReturnToReview}
                disabled={continuing}
              >
                <FileCheck2 size={15} aria-hidden="true" />
                Return to remaining measurements
              </button>
              <Button
                variant="lime"
                size="lg"
                onClick={onContinueToResults}
                disabled={!acknowledged || continuing}
                className="rc__cta"
                aria-describedby={!acknowledged ? 'rc-ack-hint' : undefined}
              >
                <CheckCheck size={16} aria-hidden="true" />
                {continuing ? 'Preparing your results…' : 'Finish for now'}
              </Button>
            </div>
            <p className="rc__ack-hint" id="rc-ack-hint">
              {acknowledged
                ? 'This leaves the unverified results out of the analysis.'
                : 'Tick the box above to finish with these results still unverified.'}
            </p>
          </>
        )}
      </div>
    </section>
  )
}
