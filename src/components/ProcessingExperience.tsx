import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Cpu,
  FileSearch,
  FileText,
  Info,
  RefreshCw,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import { Button, ButtonLink } from './Button'
import {
  triggerExtraction,
  structureReport,
  analyseReport,
  getExtraction,
  type ExtractionResult,
} from '../lib/api'
import { summarizeExtraction, type ExecutionKind } from '../lib/ocrExecution'

type ProcessStage =
  | 'preparing'
  | 'extracting'
  | 'structuring'
  | 'analysing'
  | 'ready'
  | 'failed'

type TimelineState = 'done' | 'active' | 'pending' | 'failed'

interface TimelineItem {
  key: string
  label: string
  state: TimelineState
  detail?: string
}

const STEP_INDEX: Record<ProcessStage, number> = {
  preparing: 1,
  extracting: 2,
  structuring: 3,
  analysing: 4,
  ready: 5,
  failed: 0,
}

const EXTRACTION_NOTES = [
  'OCR reads the page line by line. Dense or photographed pages can take a little longer.',
  'Test names, values and reference ranges are being located on each page.',
  'The scanner keeps running while this page is being read — no percentage is estimated.',
  'Everything stays on this computer. Nothing is sent to an external service.',
]

interface ProcessingExperienceProps {
  reportId: string
  onComplete: () => void
  onViewResults: () => void
}

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const EXECUTION_ICON: Record<ExecutionKind, typeof Cpu> = {
  gpu: Zap,
  cpu: Cpu,
  gpu_fallback: Info,
  mixed: Cpu,
  direct: FileText,
}

function executionKindClass(kind: ExecutionKind): string {
  return kind.replace(/_/g, '-')
}

function pagePlural(count: number): string {
  return count === 1 ? 'page' : 'pages'
}

function extractionActivity(extraction: ExtractionResult | null): string | null {
  if (!extraction || extraction.total_pages <= 0) return null
  if (extraction.status === 'processing' || extraction.status === 'queued') {
    if (extraction.processed_pages >= extraction.total_pages) {
      return 'Finalising extracted text'
    }
    const currentPage = Math.min(
      extraction.processed_pages + 1,
      extraction.total_pages,
    )
    return `Reading page ${currentPage} of ${extraction.total_pages}`
  }
  if (
    extraction.status === 'completed' ||
    extraction.status === 'review_required'
  ) {
    const read = extraction.processed_pages || extraction.total_pages
    return `${read} of ${extraction.total_pages} ${pagePlural(
      extraction.total_pages,
    )} read`
  }
  return null
}

function ScannerIllustration({
  stage,
  failed = false,
}: {
  stage: ProcessStage
  failed?: boolean
}) {
  if (failed) {
    return (
      <div className="proc-visual proc-visual--error" aria-hidden="true">
        <div className="proc-error-badge">
          <AlertTriangle size={30} strokeWidth={1.6} />
        </div>
      </div>
    )
  }

  if (stage === 'ready') {
    return (
      <div className="proc-visual proc-visual--ready" aria-hidden="true">
        <div className="proc-ready-burst">
          <span className="proc-ready-ring proc-ready-ring--outer" />
          <span className="proc-ready-ring proc-ready-ring--inner" />
          <div className="proc-ready-icon-wrap">
            <CheckCircle2 size={36} strokeWidth={1.7} className="proc-ready-icon" />
          </div>
        </div>
      </div>
    )
  }

  const activityLabel =
    stage === 'preparing'
      ? 'PREPARING PAGES'
      : stage === 'extracting'
        ? 'LIVE SCAN'
        : stage === 'structuring'
          ? 'STRUCTURING'
          : 'COMPARING'

  return (
    <div className="proc-visual" aria-hidden="true">
      <div className="proc-scanner">
        <span className="proc-scanner__corner proc-scanner__corner--tl" />
        <span className="proc-scanner__corner proc-scanner__corner--tr" />
        <span className="proc-scanner__corner proc-scanner__corner--bl" />
        <span className="proc-scanner__corner proc-scanner__corner--br" />

        <div className="proc-doc">
          <div className="proc-doc__head">
            <span className="proc-doc__logo" />
            <div className="proc-doc__head-lines">
              <span className="proc-doc__title" />
              <span className="proc-doc__subtitle" />
            </div>
          </div>

          <div className="proc-doc__rows">
            {[0, 1, 2, 3, 4, 5, 6].map((row) => (
              <div
                key={row}
                className={`proc-doc__row proc-doc__row--${row}`}
              >
                <span className="proc-doc__cell proc-doc__cell--name" />
                <span className="proc-doc__cell proc-doc__cell--value" />
                <span className="proc-doc__cell proc-doc__cell--range" />
              </div>
            ))}
          </div>

          <span className="proc-doc__beam" />
          <span className="proc-doc__marker proc-doc__marker--a" />
          <span className="proc-doc__marker proc-doc__marker--b" />
          <span className="proc-doc__marker proc-doc__marker--c" />
        </div>

        <span className="proc-scan-status">
          <span className="proc-scan-status__dot" />
          {activityLabel}
        </span>
      </div>
    </div>
  )
}

export function ProcessingExperience({
  reportId,
  onComplete,
  onViewResults,
}: ProcessingExperienceProps) {
  const [stage, setStage] = useState<ProcessStage>('preparing')
  const [failureStep, setFailureStep] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [structuredCount, setStructuredCount] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [noteIndex, setNoteIndex] = useState(0)

  const hasStarted = useRef(false)
  const stageRef = useRef<ProcessStage>('preparing')
  const startedAtRef = useRef<number | null>(null)
  const completeTimerRef = useRef<number | null>(null)

  const moveTo = useCallback((next: ProcessStage) => {
    stageRef.current = next
    setStage(next)
  }, [])

  // The elapsed timer is anchored to the first render and never resets when
  // polling updates or stage changes arrive.
  useEffect(() => {
    if (stage === 'ready' || stage === 'failed') return
    if (startedAtRef.current === null) {
      startedAtRef.current = Date.now()
    }
    const tick = () => {
      const startedAt = startedAtRef.current ?? Date.now()
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
      )
    }
    tick()
    const interval = window.setInterval(tick, 500)
    return () => window.clearInterval(interval)
  }, [stage])

  // Long OCR runs stay interesting without inventing progress. The note
  // rotation is keyed on the stage only, so poll updates cannot restart it.
  useEffect(() => {
    if (stage !== 'extracting') return
    const interval = window.setInterval(
      () => setNoteIndex((index) => index + 1),
      9000,
    )
    return () => window.clearInterval(interval)
  }, [stage])

  useEffect(() => {
    return () => {
      if (completeTimerRef.current !== null) {
        window.clearTimeout(completeTimerRef.current)
      }
    }
  }, [])

  const runPipeline = useCallback(async () => {
    // Poll the extraction job while the blocking extract request is in flight.
    // The backend genuinely updates processed_pages after each page, so this is
    // real page-level activity rather than simulated progress.
    const poll = window.setInterval(() => {
      void getExtraction(reportId)
        .then((live) => {
          if (live.status === 'not_started') return
          setExtraction(live)
          if (live.status === 'processing' || live.status === 'queued') {
            moveTo(live.total_pages > 0 ? 'extracting' : 'preparing')
          }
        })
        .catch(() => {
          // Status polling is best-effort; the extract response remains the
          // source of truth for completion and failure.
        })
    }, 900)

    try {
      moveTo('preparing')

      let ext: ExtractionResult
      try {
        ext = await triggerExtraction(reportId)
      } catch {
        ext = await getExtraction(reportId)
      }

      setExtraction(ext)

      if (ext.status !== 'completed' && ext.status !== 'review_required') {
        throw new Error(
          ext.status === 'failed'
            ? 'Document extraction failed. Please try a different file or format.'
            : 'Extraction did not finish. Please try again.',
        )
      }

      moveTo('structuring')
      const structure = await structureReport(reportId)
      setStructuredCount(
        typeof structure?.measurements_saved === 'number'
          ? structure.measurements_saved
          : null,
      )

      moveTo('analysing')
      await analyseReport(reportId)

      moveTo('ready')
      // Let the completion state register before handing off to the existing
      // verification entry screen. This is a short handoff, not an artificial
      // processing delay.
      completeTimerRef.current = window.setTimeout(() => {
        completeTimerRef.current = null
        onComplete()
      }, 800)
    } catch (error) {
      setFailureStep(STEP_INDEX[stageRef.current] || 1)
      setErrorMsg(
        error instanceof Error
          ? error.message
          : 'Processing failed. Please try again.',
      )
      moveTo('failed')
    } finally {
      window.clearInterval(poll)
    }
  }, [reportId, moveTo, onComplete])

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true
    void runPipeline()
  }, [runPipeline])

  const activeStep = stage === 'ready' ? 5 : STEP_INDEX[stage] || 1
  const activity = extractionActivity(extraction)
  const execution = useMemo(() => summarizeExtraction(extraction), [extraction])
  const ExecutionIcon = execution ? EXECUTION_ICON[execution.kind] : null

  const timeline: TimelineItem[] = [
    {
      key: 'validated',
      label: 'Document validated',
      state:
        stage === 'failed'
          ? failureStep === 0
            ? 'failed'
            : 'done'
          : 'done',
      detail: 'Stored locally · consent confirmed',
    },
    {
      key: 'preparing',
      label: 'Preparing pages',
      state:
        stage === 'ready'
          ? 'done'
          : stage === 'failed'
            ? (failureStep ?? 1) > 1
              ? 'done'
              : (failureStep ?? 1) === 1
                ? 'failed'
                : 'pending'
            : activeStep > 1
              ? 'done'
              : 'active',
      detail:
        stage === 'preparing'
          ? 'Rendering page images and checking document quality'
          : activeStep > 1
            ? 'Page images ready'
            : undefined,
    },
    {
      key: 'extracting',
      label: 'Extracting text and locating measurements',
      state:
        stage === 'ready'
          ? 'done'
          : stage === 'failed'
            ? (failureStep ?? 1) > 2
              ? 'done'
              : (failureStep ?? 1) === 2
                ? 'failed'
                : 'pending'
            : activeStep > 2
              ? 'done'
              : activeStep === 2
                ? 'active'
                : 'pending',
      detail:
        activeStep === 2
          ? (activity ?? 'Reading the document')
          : activeStep > 2
            ? activity ?? undefined
            : undefined,
    },
    {
      key: 'structuring',
      label: 'Structuring measurements',
      state:
        stage === 'ready'
          ? 'done'
          : stage === 'failed'
            ? (failureStep ?? 1) > 3
              ? 'done'
              : (failureStep ?? 1) === 3
                ? 'failed'
                : 'pending'
            : activeStep > 3
              ? 'done'
              : activeStep === 3
                ? 'active'
                : 'pending',
      detail:
        activeStep === 3
          ? 'Matching test names, units and reference intervals'
          : activeStep > 3 && structuredCount !== null
            ? `${structuredCount} measurement${
                structuredCount === 1 ? '' : 's'
              } structured`
            : undefined,
    },
    {
      key: 'analysing',
      label: 'Preparing verification',
      state:
        stage === 'ready'
          ? 'done'
          : stage === 'failed'
            ? (failureStep ?? 1) > 4
              ? 'done'
              : (failureStep ?? 1) === 4
                ? 'failed'
                : 'pending'
            : activeStep > 4
              ? 'done'
              : activeStep === 4
                ? 'active'
                : 'pending',
      detail:
        activeStep === 4
          ? 'Comparing results with reference intervals'
          : stage === 'ready'
            ? 'Verification workspace ready'
            : undefined,
    },
  ]

  const statusCopy = (() => {
    switch (stage) {
      case 'preparing':
        return {
          kicker: 'STAGE 2 OF 5',
          title: 'Preparing your pages',
          detail: 'Rendering page images and checking document quality.',
          chip: 'Live',
        }
      case 'extracting':
        return {
          kicker: 'STAGE 3 OF 5',
          title: 'Reading your report',
          detail:
            activity ??
            'Reading the document and locating measurements on this page.',
          chip: 'Live',
        }
      case 'structuring':
        return {
          kicker: 'STAGE 4 OF 5',
          title: 'Organising your measurements',
          detail:
            'Matching test names, values, units and reference intervals.',
          chip: 'Live',
        }
      case 'analysing':
        return {
          kicker: 'STAGE 5 OF 5',
          title: 'Preparing your verification review',
          detail:
            'Comparing verified results against your laboratory reference intervals.',
          chip: 'Live',
        }
      case 'ready':
        return {
          kicker: 'ANALYSIS COMPLETE',
          title: 'Your report is ready',
          detail: 'Measurements and patterns are prepared for you to verify.',
          chip: 'Complete',
        }
      default:
        return {
          kicker: 'PROCESSING STOPPED',
          title: 'Something went wrong',
          detail: errorMsg ?? 'Processing failed. Please try again.',
          chip: 'Stopped',
        }
    }
  })()

  const note = EXTRACTION_NOTES[noteIndex % EXTRACTION_NOTES.length]
  const pageTicksVisible =
    stage === 'extracting' &&
    extraction !== null &&
    extraction.total_pages > 1 &&
    extraction.total_pages <= 12

  return (
    <div className="proc-page">
      <div className="proc-card">
        <header className="proc-header">
          <div>
            <p className="proc-eyebrow">LOCAL DOCUMENT PROCESSING</p>
            <h1 className="proc-title">Processing your report</h1>
          </div>
          <span
            className={`proc-live-chip ${
              stage === 'ready'
                ? 'is-complete'
                : stage === 'failed'
                  ? 'is-stopped'
                  : 'is-live'
            }`}
          >
            <span className="proc-live-chip__dot" aria-hidden="true" />
            {statusCopy.chip}
          </span>
        </header>

        <div className="proc-layout">
          <ScannerIllustration stage={stage} failed={stage === 'failed'} />

          <div className="proc-live" role="status" aria-live="polite">
            <div className="proc-status-head">
              <div>
                <p className="proc-kicker">{statusCopy.kicker}</p>
                <h2 className="proc-status-title">{statusCopy.title}</h2>
              </div>
              <span
                className="proc-elapsed"
                aria-label={`Elapsed time ${formatElapsed(elapsedSeconds)}`}
              >
                {formatElapsed(elapsedSeconds)}
              </span>
            </div>

            <p className="proc-status-detail">{statusCopy.detail}</p>

            {execution && ExecutionIcon ? (
              <div
                className={`proc-execution proc-execution--${executionKindClass(execution.kind)}`}
              >
                <ExecutionIcon size={13} strokeWidth={2} aria-hidden="true" />
                <div className="proc-execution__text">
                  <span className="proc-execution__label">{execution.headline}</span>
                  {execution.detail ? (
                    <span className="proc-execution__detail">{execution.detail}</span>
                  ) : null}
                  {execution.pageBreakdown && extraction && extraction.total_pages > 1 ? (
                    <span className="proc-execution__pages">{execution.pageBreakdown}</span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div
              className={`proc-activity ${
                stage === 'ready' ? 'is-complete' : ''
              } ${stage === 'failed' ? 'is-stopped' : ''}`}
              role={stage === 'ready' ? undefined : 'progressbar'}
              aria-label={
                stage === 'ready' ? undefined : 'Processing in progress'
              }
              aria-valuetext={
                stage === 'ready' ? undefined : statusCopy.detail
              }
            >
              <span className="proc-activity__sweep" />
            </div>

            {pageTicksVisible ? (
              <div className="proc-page-ticks" aria-hidden="true">
                {Array.from(
                  { length: extraction.total_pages },
                  (_, index) => (
                    <span
                      key={index}
                      className={`proc-page-tick${
                        index < extraction.processed_pages
                          ? ' is-done'
                          : index === extraction.processed_pages
                            ? ' is-active'
                            : ''
                      }`}
                    />
                  ),
                )}
              </div>
            ) : null}

            <ol className="proc-timeline" aria-label="Processing steps">
              {timeline.map((item) => (
                <li
                  key={item.key}
                  className={`proc-timeline__item is-${item.state}`}
                >
                  <span className="proc-timeline__marker" aria-hidden="true">
                    {item.state === 'done' ? (
                      <Check size={11} strokeWidth={3} />
                    ) : item.state === 'failed' ? (
                      <AlertTriangle size={10} strokeWidth={2.4} />
                    ) : null}
                  </span>
                  <span className="proc-timeline__text">
                    <span className="proc-timeline__label">{item.label}</span>
                    {item.detail ? (
                      <span className="proc-timeline__detail">
                        {item.detail}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>

            {stage === 'extracting' ? (
              <p className="proc-live-note">
                <FileSearch size={12} strokeWidth={1.8} aria-hidden="true" />
                {note}
              </p>
            ) : null}
          </div>
        </div>

        <footer className="proc-footer">
          {stage === 'ready' ? (
            <div className="proc-actions">
              <Button
                variant="lime"
                size="lg"
                onClick={onViewResults}
                className="proc-action-primary"
              >
                Review &amp; verify results
                <ArrowRight size={15} aria-hidden="true" />
              </Button>
              <span className="proc-handoff">Opening your verification workspace…</span>
            </div>
          ) : stage === 'failed' ? (
            <div className="proc-actions">
              <ButtonLink to="/app/upload" variant="lime">
                <RefreshCw size={14} aria-hidden="true" />
                Try again
              </ButtonLink>
              <ButtonLink to="/app/reports" variant="ghost" size="sm">
                My reports
              </ButtonLink>
            </div>
          ) : (
            <div className="proc-running">
              <span className="proc-running__pulse" aria-hidden="true" />
              <span>
                Working locally · the timer keeps running while OCR reads each
                page
              </span>
            </div>
          )}

          <div className="proc-privacy">
            <ShieldCheck size={12} strokeWidth={2} aria-hidden="true" />
            <span>Local processing only · Zero external data transmission</span>
          </div>
        </footer>
      </div>
    </div>
  )
}
