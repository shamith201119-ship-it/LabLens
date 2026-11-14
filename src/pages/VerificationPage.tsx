import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCheck,
  FileText,
  Info,
  TriangleAlert,
  X,
} from 'lucide-react'
import { ButtonLink } from '../components/Button'
import { PageContainer } from '../components/PageHeader'
import { usePageTitle } from '../lib/usePageTitle'
import {
  VerificationHeader,
} from '../components/verification/VerificationHeader'
import { SourcePanel, type RenderedImageSize } from '../components/verification/SourcePanel'
import { MeasurementWorkspace } from '../components/verification/MeasurementWorkspace'
import { InspectionPanel } from '../components/verification/InspectionPanel'
import { displayName, isConfirmed, summarize, type VerificationFilter } from '../lib/verification'
import {
  analyseReport,
  downloadUrl,
  getAnalysis,
  getExtraction,
  getReport,
  listMeasurements,
  pageImageUrl,
  patchMeasurement,
  verifyMeasurement,
  verifySelectedMeasurements,
  type ApiReport,
  type ExtractionResult,
  type Measurement,
} from '../lib/api'
import { ReviewCompletion } from '../components/verification/ReviewCompletion'

type SourceBBox = [number, number, number, number]

const WIDE_LAYOUT = '(min-width: 1200px)'
const DOCKED_INSPECTION = '(min-width: 861px) and (max-width: 1199px)'

function subscribeWideLayout(callback: () => void): () => void {
  const query = window.matchMedia(WIDE_LAYOUT)
  query.addEventListener('change', callback)
  return () => query.removeEventListener('change', callback)
}

function useWideLayout(): boolean {
  return useSyncExternalStore(
    subscribeWideLayout,
    () => window.matchMedia(WIDE_LAYOUT).matches,
    () => false,
  )
}

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
  usePageTitle('Review your results — LabLens')
  const navigate = useNavigate()
  const wideLayout = useWideLayout()
  const returnFocusRef = useRef(false)

  const [report, setReport] = useState<ApiReport | null>(null)
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null)
  const [naturalImageSize, setNaturalImageSize] = useState<RenderedImageSize | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activePage, setActivePage] = useState(1)
  const [mobileTab, setMobileTab] = useState<'document' | 'measurements'>('measurements')
  const [docViewMode, setDocViewMode] = useState<'preview' | 'ocr'>('preview')
  const [savingCorrection, setSavingCorrection] = useState(false)
  const [correctionError, setCorrectionError] = useState<string | null>(null)
  const [autoEditId, setAutoEditId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmingSelected, setConfirmingSelected] = useState(false)
  const [continuing, setContinuing] = useState(false)
  const [filter, setFilter] = useState<VerificationFilter>('all')
  const [search, setSearch] = useState('')
  const [completionOpen, setCompletionOpen] = useState(false)
  const [editSignal, setEditSignal] = useState(0)
  const [announcement, setAnnouncement] = useState('')

  const loadData = async () => {
    if (!reportId) return
    setSelectedMeasurementId(null)
    setAutoEditId(null)
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

  const handleVerifyOne = async (measurementId: string) => {
    if (!reportId) return
    const current = measurements.find((m) => m.id === measurementId)
    const name = current ? displayName(current) : 'Result'
    try {
      const updated = await verifyMeasurement(reportId, measurementId)
      setMeasurements((prev) => prev.map((m) => (m.id === measurementId ? updated : m)))
      setSelectedIds((prev) => {
        if (!prev.has(measurementId)) return prev
        const next = new Set(prev)
        next.delete(measurementId)
        return next
      })
      setAnnouncement(`${name} confirmed.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
    }
  }

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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed')
    } finally {
      setConfirmingSelected(false)
    }
  }

  const handleSelectMeasurement = (measurement: Measurement) => {
    setSelectedMeasurementId(measurement.id)
    setAutoEditId(null)
    if (measurement.page_number > 0 && measurement.page_number !== activePage) {
      setActivePage(measurement.page_number)
    }
    if (window.matchMedia(DOCKED_INSPECTION).matches) {
      setMobileTab('document')
    }
  }

  const handleCloseInspection = () => {
    setSelectedMeasurementId(null)
    setAutoEditId(null)
    setCorrectionError(null)
    if (window.matchMedia(DOCKED_INSPECTION).matches) {
      setMobileTab('measurements')
    }
  }

  const handleStartEdit = (m: Measurement) => {
    setSelectedMeasurementId(m.id)
    if (m.page_number > 0 && m.page_number !== activePage) {
      setActivePage(m.page_number)
    }
    if (window.matchMedia(DOCKED_INSPECTION).matches) {
      setMobileTab('document')
    }
    setAutoEditId(m.id)
    setEditSignal((value) => value + 1)
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
      setAnnouncement(
        `${displayName(updated)} correction saved. It now needs review.`,
      )
      return updated
    } catch (e) {
      setCorrectionError(e instanceof Error ? e.message : 'Failed to save correction')
      return null
    } finally {
      setSavingCorrection(false)
    }
  }

  const handleConfirmAndContinue = () => {
    if (!reportId) return
    returnFocusRef.current = true
    setCompletionOpen(true)
    setError(null)
    window.scrollTo({ top: 0 })
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
      document
        .querySelector<HTMLButtonElement>('.ve-continue__cta')
        ?.focus({ preventScroll: true })
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
          <div className="ve-skel-grid">
            <div className="ve-skel ve-skel--panel" />
            <div className="ve-skel ve-skel--panel" />
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
  const selectedMeasurement =
    measurements.find((m) => m.id === selectedMeasurementId) ?? null
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
  const highlightStyle =
    showImagePreview &&
    selectedMeasurement &&
    selectedMeasurement.page_number === activePage
      ? buildHighlightStyle(
          selectedMeasurement.source_bbox,
          highlightPageWidth,
          highlightPageHeight,
        )
      : null

  const inspectionPanel = selectedMeasurement ? (
    <InspectionPanel
      key={`${selectedMeasurement.id}:${autoEditId === selectedMeasurement.id ? editSignal : 'view'}`}
      measurement={selectedMeasurement}
      extraction={extraction}
      activePage={activePage}
      onConfirm={handleVerifyOne}
      onCorrect={handleCorrectSave}
      onClose={handleCloseInspection}
      initialEdit={autoEditId === selectedMeasurement.id}
      confirming={confirmingSelected}
      savingCorrection={savingCorrection}
      correctionError={correctionError}
    />
  ) : null
  const showRailInspection = wideLayout && selectedMeasurement !== null
  const showDockedInspection = !wideLayout && selectedMeasurement !== null

  return (
    <PageContainer className="ve-page">
      <Link className="viewer-back" to="/app/reports">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to my reports
      </Link>

      <VerificationHeader summary={summary} />

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
      {/* Mobile segmented control: Document / Measurements */}
      <div className="ve-mobile-tabs" role="group" aria-label="Verification view">
        <button
          type="button"
          id="ve-tab-document"
          aria-pressed={mobileTab === 'document'}
          aria-controls="ve-panel-document"
          className={`ve-tab${mobileTab === 'document' ? ' is-active' : ''}`}
          onClick={() => setMobileTab('document')}
        >
          <FileText size={14} aria-hidden="true" />
          Document
        </button>
        <button
          type="button"
          id="ve-tab-measurements"
          aria-pressed={mobileTab === 'measurements'}
          aria-controls="ve-panel-measurements"
          className={`ve-tab${mobileTab === 'measurements' ? ' is-active' : ''}`}
          onClick={() => setMobileTab('measurements')}
        >
          <CheckCheck size={14} aria-hidden="true" />
          Measurements ({measurements.length})
        </button>
      </div>

      <div className={`ve-split${showRailInspection || showDockedInspection ? ' ve-split--inspect' : ''}`}>
        <SourcePanel
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
          hiddenOnMobile={mobileTab === 'measurements'}
          dockedContent={wideLayout ? null : inspectionPanel}
        />

        {showRailInspection ? (
          inspectionPanel
        ) : (
          <MeasurementWorkspace
            measurements={measurements}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onClearSelection={() => setSelectedIds(new Set())}
            confirmingSelected={confirmingSelected}
            onConfirmSelected={handleConfirmSelected}
            filter={filter}
            onFilterChange={setFilter}
            search={search}
            onSearchChange={setSearch}
            selectedMeasurementId={selectedMeasurementId}
            onOpenInspection={handleSelectMeasurement}
            onVerifyOne={handleVerifyOne}
            onStartEdit={handleStartEdit}
            hiddenOnMobile={mobileTab === 'document'}
            continuing={continuing}
            onConfirmAndContinue={handleConfirmAndContinue}
          />
        )}
      </div>

      <p className="ve-disclaimer">
        <Info size={12} aria-hidden="true" />
        <span>
          Verification checks that the values LabLens transcribed match your original
          report. The original file and its measurements are always preserved, and
          unconfirmed results are excluded from analysis.
        </span>
      </p>
        </>
      )}
    </PageContainer>
  )
}
