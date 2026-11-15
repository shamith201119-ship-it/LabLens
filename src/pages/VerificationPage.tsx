import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileSearch, Info, TriangleAlert, X } from 'lucide-react'
import { ButtonLink } from '../components/Button'
import { PageContainer } from '../components/PageHeader'
import { usePageTitle } from '../lib/usePageTitle'
import { MeasurementGrid } from '../components/verification/MeasurementGrid'
import { ConfirmBar } from '../components/verification/ConfirmBar'
import { ReportViewer } from '../components/verification/ReportViewer'
import { InspectionPanel } from '../components/verification/InspectionPanel'
import type { RenderedImageSize } from '../components/verification/SourcePanel'
import { displayName, isConfirmed, summarize } from '../lib/verification'
import {
  analyseReport,
  downloadUrl,
  getAnalysis,
  getExtraction,
  getReport,
  listMeasurements,
  pageImageUrl,
  patchMeasurement,
  verifySelectedMeasurements,
  type ApiReport,
  type ExtractionResult,
  type Measurement,
} from '../lib/api'
import { ReviewCompletion } from '../components/verification/ReviewCompletion'

type SourceBBox = [number, number, number, number]

function buildHighlightStyle(
  bbox: Measurement['source_bbox'],
  pageWidth: number | null,
  pageHeight: number | null,
) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return null
  if (!bbox.every((value) => typeof value === 'number' && Number.isFinite(value))) return null
  if (pageWidth == null || pageHeight == null || pageWidth <= 0 || pageHeight <= 0) return null

  const [x0, y0, x1, y1] = bbox as SourceBBox
  if (x0 >= x1 || y0 >= y1) return null
  if (x0 < 0 || y0 < 0 || x1 > pageWidth || y1 > pageHeight) return null

  return {
    left: `${(x0 / pageWidth) * 100}%`,
    top: `${(y0 / pageHeight) * 100}%`,
    width: `${((x1 - x0) / pageWidth) * 100}%`,
    height: `${((y1 - y0) / pageHeight) * 100}%`,
  }
}

export function VerificationPage() {
  const { reportId } = useParams()
  usePageTitle('Verify your results — LabLens')
  const navigate = useNavigate()
  const returnFocusRef = useRef(false)

  const [report, setReport] = useState<ApiReport | null>(null)
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [naturalImageSize, setNaturalImageSize] = useState<RenderedImageSize | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePage, setActivePage] = useState(1)
  const [docViewMode, setDocViewMode] = useState<'preview' | 'ocr'>('preview')
  const [savingCorrection, setSavingCorrection] = useState(false)
  const [correctionError, setCorrectionError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmingSelected, setConfirmingSelected] = useState(false)
  const [continuing, setContinuing] = useState(false)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerMeasurementId, setViewerMeasurementId] = useState<string | null>(null)
  const [inspectId, setInspectId] = useState<string | null>(null)
  const [inspectEdit, setInspectEdit] = useState(false)

  const loadData = async () => {
    if (!reportId) return
    setNaturalImageSize(null)
    setLoading(true)
    setError(null)
    try {
      const [r, ext, ms] = await Promise.all([
        getReport(reportId),
        getExtraction(reportId).catch(() => null),
        listMeasurements(reportId).catch(() => []),
      ])
      setReport(r)
      setExtraction(ext)
      setMeasurements(ms)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadData()
    }, 0)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  const handleToggleSelect = (measurementId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(measurementId)) {
        next.delete(measurementId)
      } else {
        next.add(measurementId)
      }
      return next
    })
  }

  const handleConfirmSelected = async () => {
    if (!reportId || selectedIds.size === 0) return
    setConfirmingSelected(true)
    setError(null)
    const ids = Array.from(selectedIds)
    try {
      const result = await verifySelectedMeasurements(reportId, ids)
      const byId = new Map(result.measurements.map((m) => [m.id, m]))
      setMeasurements((prev) => prev.map((m) => byId.get(m.id) ?? m))
      setSelectedIds(new Set())
      const count = result.measurements.length
      setAnnouncement(`${count} ${count === 1 ? 'result' : 'results'} confirmed.`)
      returnFocusRef.current = true
      setCompletionOpen(true)
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setConfirmingSelected(false)
    }
  }

  const handleContinueWithoutSelection = () => {
    if (!reportId) return
    returnFocusRef.current = true
    setCompletionOpen(true)
    setError(null)
    window.scrollTo({ top: 0 })
  }

  const handleOpenReport = (measurement?: Measurement) => {
    if (measurement) {
      setViewerMeasurementId(measurement.id)
      if (measurement.page_number > 0 && measurement.page_number !== activePage) {
        setActivePage(measurement.page_number)
      }
    } else {
      setViewerMeasurementId(null)
    }
    setViewerOpen(true)
  }

  const handleStartEdit = (measurement: Measurement) => {
    setInspectId(measurement.id)
    setInspectEdit(true)
    setCorrectionError(null)
    if (measurement.page_number > 0 && measurement.page_number !== activePage) {
      setActivePage(measurement.page_number)
    }
  }

  const handleCloseInspection = () => {
    setInspectId(null)
    setInspectEdit(false)
    setCorrectionError(null)
  }

  const handleCorrectSave = async (id: string, patch: Record<string, unknown>) => {
    if (!reportId) return null
    setSavingCorrection(true)
    setCorrectionError(null)
    try {
      const updated = await patchMeasurement(reportId, id, patch)
      setMeasurements((prev) => prev.map((m) => (m.id === id ? updated : m)))
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setAnnouncement(`${displayName(updated)} correction saved. It now needs review.`)
      return updated
    } catch (e) {
      setCorrectionError(e instanceof Error ? e.message : 'Failed to save correction')
      return null
    } finally {
      setSavingCorrection(false)
    }
  }

  const handleContinueToResults = async () => {
    if (!reportId) return
    setContinuing(true)
    setError(null)
    try {
      // Reuse the existing analysis when it already matches this report's
      // measurement state; otherwise run a fresh one before navigating.
      const existing = await getAnalysis(reportId).catch(() => null)
      if (existing?.freshness === 'current') {
        navigate(`/app/reports/${reportId}/results`)
        return
      }
      await analyseReport(reportId)
      navigate(`/app/reports/${reportId}/results`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to finalize analysis')
      setContinuing(false)
    }
  }

  useEffect(() => {
    if (completionOpen || !returnFocusRef.current) return
    returnFocusRef.current = false
    const timer = window.setTimeout(() => {
      const next =
        document.querySelector<HTMLElement>('.ve-card__box:not(:checked)') ??
        document.querySelector<HTMLElement>('.ve-confirmbar__cta')
      next?.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [completionOpen])

  if (loading) {
    return (
      <PageContainer className="ve-page">
        <div className="ve-loading" aria-live="polite" aria-busy="true">
          <span className="ve-sr-only">Loading extracted results…</span>
          <div className="ve-skel ve-skel--eyebrow" />
          <div className="ve-skel ve-skel--title" />
          <div className="ve-skel ve-skel--sub" />
          <div className="ve-skel-cards">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <div key={key} className="ve-skel ve-skel--card" />
            ))}
          </div>
        </div>
      </PageContainer>
    )
  }

  if (error && !report) {
    return (
      <PageContainer className="ve-page">
        <Link className="viewer-back" to="/app/reports">
          <ArrowLeft size={14} aria-hidden="true" />
          Back to reports
        </Link>
        <div className="ve-error" role="alert">
          <TriangleAlert size={20} strokeWidth={1.8} aria-hidden="true" />
          <p>{error}</p>
          <ButtonLink to="/app/reports" variant="secondary" size="sm">
            Back to my reports
          </ButtonLink>
        </div>
      </PageContainer>
    )
  }

  const totalPages = extraction?.total_pages || 1
  const currentPageExtraction = extraction?.pages.find(
    (p) => p.page_number === activePage,
  )
  const summary = summarize(measurements)
  const isImage = Boolean(
    report && ['jpg', 'jpeg', 'png'].includes(report.file_extension.toLowerCase()),
  )
  const isPdf = Boolean(report?.file_extension.toLowerCase() === 'pdf')
  const isOcrPdfPage = Boolean(
    isPdf && currentPageExtraction?.extraction_method === 'ocr',
  )
  const imageSource = reportId
    ? isImage
      ? downloadUrl(reportId)
      : isPdf
        ? pageImageUrl(reportId, activePage)
        : null
    : null
  const showImagePreview = Boolean(imageSource)
  const renderedPdfPageSize =
    naturalImageSize?.pageNumber === activePage ? naturalImageSize : null
  const highlightPageWidth = isImage
    ? currentPageExtraction?.page_width ?? null
    : isOcrPdfPage
      ? renderedPdfPageSize?.width ?? null
      : currentPageExtraction?.page_width ?? null
  const highlightPageHeight = isImage
    ? currentPageExtraction?.page_height ?? null
    : isOcrPdfPage
      ? renderedPdfPageSize?.height ?? null
      : currentPageExtraction?.page_height ?? null

  const inspectMeasurement = measurements.find((m) => m.id === inspectId) ?? null
  const viewerMeasurement = measurements.find((m) => m.id === viewerMeasurementId) ?? null
  const highlightStyle =
    viewerOpen &&
    showImagePreview &&
    viewerMeasurement &&
    viewerMeasurement.page_number === activePage
      ? buildHighlightStyle(
          viewerMeasurement.source_bbox,
          highlightPageWidth,
          highlightPageHeight,
        )
      : null
  const viewerTitle = viewerMeasurement
    ? displayName(viewerMeasurement)
    : report?.original_filename ?? 'Original report'
  const hasBar = !completionOpen && measurements.length > 0

  return (
    <PageContainer className={`ve-page${hasBar ? ' has-confirmbar' : ''}`}>
      <Link className="viewer-back" to="/app/reports">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to my reports
      </Link>

      {completionOpen ? (
        <ReviewCompletion
          summary={summary}
          unverifiedNames={measurements.filter((m) => !isConfirmed(m)).map(displayName)}
          unverifiedCount={summary.needsReview}
          onReturnToReview={() => setCompletionOpen(false)}
          onContinueToResults={handleContinueToResults}
          continuing={continuing}
        />
      ) : (
        <>
          <header className="ve-pagehead">
            <p className="ve-eyebrow">Step 3 of 4 · Verify</p>
            <h1 className="ve-headline">Verify your results</h1>
            <p className="ve-instruction">
              Compare each value with your report. Select the values that match.
            </p>
            <p className="ve-helper">
              You&apos;re checking transcription accuracy, not medical normality.
            </p>
          </header>

          {error ? (
            <div className="ve-error-bar" role="alert">
              <TriangleAlert size={14} aria-hidden="true" />
              <span>{error}</span>
              <button
                type="button"
                className="ve-error-bar__dismiss"
                onClick={() => setError(null)}
                aria-label="Dismiss error"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ) : null}

          <div className="ve-sr-only" role="status" aria-live="polite" aria-atomic="true">
            {announcement}
          </div>

          <div className="ve-toolbar">
            <p className="ve-toolbar__stat">
              <span>
                <strong>{summary.total}</strong>{' '}
                {summary.total === 1 ? 'result' : 'results'}
              </span>
              <span className="ve-toolbar__sep" aria-hidden="true">
                ·
              </span>
              <span>
                <strong>{summary.confirmed}</strong> confirmed
              </span>
            </p>
            <button
              type="button"
              className="ve-toolbar__action"
              onClick={() => handleOpenReport()}
            >
              <FileSearch size={15} aria-hidden="true" />
              View original report
            </button>
          </div>

          <MeasurementGrid
            measurements={measurements}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onOpenSource={handleOpenReport}
            onEdit={handleStartEdit}
          />

          <p className="ve-disclaimer">
            <Info size={12} aria-hidden="true" />
            <span>
              Verification checks that the values LabLens transcribed match your original
              report. The original file and its measurements are always preserved, and
              unconfirmed results are excluded from analysis.
            </span>
          </p>

          {hasBar ? (
            <ConfirmBar
              selectedCount={selectedIds.size}
              needsReview={summary.needsReview}
              total={summary.total}
              busy={confirmingSelected}
              onConfirmSelected={handleConfirmSelected}
              onContinue={handleContinueWithoutSelection}
            />
          ) : null}
        </>
      )}

      {viewerOpen ? (
        <ReportViewer
          reportId={reportId}
          report={report}
          totalPages={totalPages}
          activePage={activePage}
          onPageChange={setActivePage}
          docViewMode={docViewMode}
          onDocViewModeChange={setDocViewMode}
          isOcrPdfPage={isOcrPdfPage}
          imageSource={imageSource}
          currentPageExtraction={currentPageExtraction}
          highlightStyle={highlightStyle}
          onImageLoad={setNaturalImageSize}
          title={viewerTitle}
          restoreSelector={
            viewerMeasurement ? `#ve-source-${viewerMeasurement.id}` : '.ve-toolbar__action'
          }
          onClose={() => setViewerOpen(false)}
        />
      ) : null}

      {inspectMeasurement ? (
        <InspectionPanel
          key={`${inspectMeasurement.id}:${inspectEdit ? 'edit' : 'view'}`}
          measurement={inspectMeasurement}
          extraction={extraction}
          activePage={activePage}
          onCorrect={handleCorrectSave}
          onClose={handleCloseInspection}
          initialEdit={inspectEdit}
          savingCorrection={savingCorrection}
          correctionError={correctionError}
        />
      ) : null}
    </PageContainer>
  )
}
