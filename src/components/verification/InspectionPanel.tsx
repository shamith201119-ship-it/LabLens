import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, ChevronDown, Edit2, X } from 'lucide-react'
import { Button } from '../Button'
import type { Measurement, ExtractionResult } from '../../lib/api'
import {
  displayName,
  isConfirmed,
  isCritical,
  measurementConfidence,
  sourceMethodLabel,
  rangeFlagLabel,
  formatOcrScore,
  bboxBounds,
  bboxOverlapRatio,
} from '../../lib/verification'
import { useDialogBehavior } from './useDialogBehavior'

interface InspectionPanelProps {
  measurement: Measurement
  extraction: ExtractionResult | null
  activePage: number
  onCorrect: (
    measurementId: string,
    patch: Record<string, unknown>,
  ) => Promise<Measurement | null>
  onClose: () => void
  /** Mount-time intent: true when opened via the card's edit action. */
  initialEdit?: boolean
  savingCorrection: boolean
  correctionError: string | null
}

interface OcrItem {
  text: string
  confidence: number | null
  bbox: [number, number, number, number] | null
}

function parseOcrItems(metadata: unknown): OcrItem[] {
  if (!metadata || typeof metadata !== 'object') return []
  const items = (metadata as Record<string, unknown>).ocr_items
  if (!Array.isArray(items)) return []
  return items
    .map((raw): OcrItem | null => {
      if (!raw || typeof raw !== 'object') return null
      const obj = raw as Record<string, unknown>
      const text = String(obj.text ?? '').trim()
      if (!text) return null
      const confidence =
        typeof obj.confidence === 'number' && Number.isFinite(obj.confidence)
          ? obj.confidence
          : null
      return { text, confidence, bbox: bboxBounds(obj.bbox) }
    })
    .filter((item): item is OcrItem => item !== null)
}

/**
 * Detail view for a single measurement: source evidence, correction history
 * behaviour and the correction form. It never confirms anything — confirmation
 * happens through the one sticky action bar after an explicit selection.
 */
export function InspectionPanel({
  measurement,
  extraction,
  activePage,
  onCorrect,
  onClose,
  initialEdit,
  savingCorrection,
  correctionError,
}: InspectionPanelProps) {
  const [editing, setEditing] = useState(() => initialEdit === true)
  const [resultValue, setResultValue] = useState(measurement.result_original)
  const [unit, setUnit] = useState(measurement.unit_original ?? '')
  const [referenceRange, setReferenceRange] = useState(
    measurement.reference_range_original ?? '',
  )
  const [ghostOriginal, setGhostOriginal] = useState({
    result: measurement.result_original,
    unit: measurement.unit_original ?? '',
    range: measurement.reference_range_original ?? '',
  })
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [showEvidence, setShowEvidence] = useState(true)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useDialogBehavior(dialogRef, onClose, `#ve-edit-${measurement.id}`)

  const page = measurement.page_number > 0 ? measurement.page_number : activePage
  const pageMeta = extraction?.pages.find((p) => p.page_number === page)
  const ocrItems = useMemo(
    () => (measurement.extraction_method === 'ocr' ? parseOcrItems(pageMeta?.metadata) : []),
    [pageMeta?.metadata, measurement.extraction_method],
  )
  const measurementBBox = measurement.source_bbox
  const overlapItems = useMemo(
    () =>
      measurementBBox
        ? ocrItems.filter((item) => item.bbox && bboxOverlapRatio(measurementBBox, item.bbox!) > 0)
        : [],
    [measurementBBox, ocrItems],
  )

  const confidence = measurementConfidence(measurement)
  const confirmed = isConfirmed(measurement)
  const critical = isCritical(measurement)
  const flagLabel = rangeFlagLabel(measurement)
  const name = displayName(measurement)

  const startEdit = () => {
    setGhostOriginal({
      result: measurement.result_original,
      unit: measurement.unit_original ?? '',
      range: measurement.reference_range_original ?? '',
    })
    setResultValue(measurement.result_original)
    setUnit(measurement.unit_original ?? '')
    setReferenceRange(measurement.reference_range_original ?? '')
    setEditing(true)
    setFieldError(null)
  }

  const saveCorrection = async () => {
    const trimmed = resultValue.trim()
    if (!trimmed) {
      setFieldError('Enter a value before saving.')
      return
    }
    const updated = await onCorrect(measurement.id, {
      result_original: trimmed,
      unit_original: unit.trim() || null,
      reference_range_original: referenceRange.trim() || null,
    })
    if (updated) {
      setEditing(false)
      setFieldError(null)
    }
  }

  return createPortal(
    <div className="ve-modal-root">
      <div className="ve-modal-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        className="ve-modal ve-modal--inspect"
        role="dialog"
        aria-modal="true"
        aria-label={`Inspect ${name}`}
        tabIndex={-1}
      >
        <div className="ve-inspect">
          <header className="ve-inspect__head">
            <div className="ve-inspect__identity">
              <p className="ve-inspect__eyebrow">
                Inspect result
                {measurement.has_corrections ? (
                  <span className="ve-inspect__edited">Edited</span>
                ) : null}
              </p>
              <h3 className="ve-inspect__name">{name}</h3>
              <p className="ve-inspect__statusline">
                <span
                  className={`ve-status-dot ${confirmed ? 've-status-dot--ok' : 've-status-dot--pending'}`}
                />
                <span>{confirmed ? 'Confirmed' : 'Needs review'}</span>
                <span className="ve-inspect__sep">·</span>
                <span>Page {page}</span>
                {critical ? (
                  <>
                    <span className="ve-inspect__sep">·</span>
                    <span className="ve-inspect__critical">Critical flag</span>
                  </>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              className="ve-icon-btn ve-icon-btn--small"
              onClick={onClose}
              aria-label="Close result details"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </header>

          <div className="ve-inspect__value-row">
            <p className="ve-inspect__value">{measurement.result_original}</p>
            {measurement.unit_original ? (
              <span className="ve-inspect__unit">{measurement.unit_original}</span>
            ) : null}
          </div>
          <div className="ve-inspect__meta">
            <span className="ve-inspect__range">
              {measurement.reference_range_original
                ? `Reference ${measurement.reference_range_original}`
                : 'No reference recorded'}
            </span>
            {flagLabel ? (
              <span className="ve-inspect__flag">{flagLabel}</span>
            ) : (
              <span className="ve-inspect__flag ve-inspect__flag--neutral">
                {measurement.derived_flag === 'within_range' ? 'Within range' : 'Flag unknown'}
              </span>
            )}
          </div>

          <section className="ve-inspect__evidence" aria-label="Source evidence">
            <div className="ve-inspect__evidence-head">
              <span className="ve-inspect__section-label">Source evidence</span>
              <span className="ve-inspect__method">{sourceMethodLabel(measurement)}</span>
            </div>
            <div className="ve-inspect__evidence-body">
              <p className="ve-inspect__evidence-line">
                <span>Original page</span>
                <span>
                  p.{page}
                  {extraction && totalPageCount(extraction) > 1
                    ? ` of ${totalPageCount(extraction)}`
                    : ''}
                </span>
              </p>
              {confidence !== null ? (
                <p className="ve-inspect__evidence-line">
                  <span>OCR confidence</span>
                  <span>{formatOcrScore(confidence)}</span>
                </p>
              ) : (
                <p className="ve-inspect__evidence-line">
                  <span>OCR confidence</span>
                  <span className="ve-inspect__muted">Not available for this page</span>
                </p>
              )}
              <button
                type="button"
                className="ve-inspect__toggle"
                onClick={() => setShowEvidence((v) => !v)}
                aria-expanded={showEvidence}
              >
                {measurement.extraction_method === 'ocr'
                  ? 'Show extracted OCR lines'
                  : 'Show extracted text'}
                {showEvidence ? (
                  <ChevronDown size={13} aria-hidden="true" />
                ) : (
                  <ChevronRight size={13} aria-hidden="true" />
                )}
              </button>
              {showEvidence ? (
                <div className="ve-inspect__lines" role="log" aria-label="Extracted source lines">
                  {measurement.extraction_method === 'ocr' ? (
                    ocrItems.length === 0 ? (
                      <p className="ve-inspect__lines-empty">No OCR line data for this page.</p>
                    ) : (
                      <>
                        {measurementBBox && overlapItems.length > 0 ? (
                          <p className="ve-inspect__lines-note">
                            Lines overlapping this measurement’s highlighted region.
                          </p>
                        ) : null}
                        {ocrItems.map((item, index) => {
                          const overlaps =
                            measurementBBox &&
                            item.bbox &&
                            bboxOverlapRatio(measurementBBox, item.bbox) > 0
                          const itemBadge =
                            item.confidence !== null ? formatOcrScore(item.confidence) : null
                          return (
                            <div
                              key={`${index}-${item.text.slice(0, 24)}`}
                              className={`ve-inspect__line${overlaps ? ' is-overlap' : ''}`}
                            >
                              <span className="ve-inspect__line-text">{item.text}</span>
                              {itemBadge ? (
                                <span className="ve-inspect__line-conf">{itemBadge}</span>
                              ) : null}
                            </div>
                          )
                        })}
                      </>
                    )
                  ) : (
                    <>
                      {pageMeta?.raw_text ? (
                        <pre className="ve-inspect__digital-text">{pageMeta.raw_text}</pre>
                      ) : (
                        <p className="ve-inspect__lines-empty">No text data for this page.</p>
                      )}
                      {measurement.extraction_method === 'digital' && (
                        <p className="ve-inspect__lines-note">
                          Digital text layer — confidence is not applicable.
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          {!editing ? (
            <div className="ve-inspect__actions">
              <button type="button" className="ve-ghost-btn" onClick={startEdit}>
                <Edit2 size={13} aria-hidden="true" />
                Edit extracted value
              </button>
              <p className="ve-inspect__footnote">
                {confirmed
                  ? 'Confirmed values are used in analysis. Correcting this value returns it to needs review.'
                  : 'Unconfirmed results are excluded from analysis until you select and confirm them.'}
              </p>
            </div>
          ) : (
            <div className="ve-inspect__edit" role="group" aria-label={`Correct ${name}`}>
              <p className="ve-inspect__section-label">Correct this extraction</p>
              <div className="ve-inspect__ghost">
                <span>Original extracted value</span>
                <span>
                  {ghostOriginal.result}
                  {ghostOriginal.unit ? ` ${ghostOriginal.unit}` : ''}
                </span>
              </div>

              <label className="ve-field">
                <span>Result value</span>
                <input
                  type="text"
                  value={resultValue}
                  onChange={(event) => setResultValue(event.target.value)}
                  autoFocus
                  aria-invalid={fieldError ? true : false}
                />
              </label>
              <div className="ve-inspect__field-pair">
                <label className="ve-field">
                  <span>Unit</span>
                  <input
                    type="text"
                    value={unit}
                    placeholder="e.g. mg/dL"
                    onChange={(event) => setUnit(event.target.value)}
                  />
                </label>
                <label className="ve-field">
                  <span>Reference interval</span>
                  <input
                    type="text"
                    value={referenceRange}
                    placeholder="e.g. 70 - 99"
                    onChange={(event) => setReferenceRange(event.target.value)}
                  />
                </label>
              </div>

              {fieldError ? (
                <p className="ve-inspect__error" role="alert">
                  {fieldError}
                </p>
              ) : null}
              {correctionError ? (
                <p className="ve-inspect__error" role="alert">
                  {correctionError}
                </p>
              ) : null}

              <div className="ve-inspect__edit-actions">
                <Button
                  variant="lime"
                  size="sm"
                  onClick={saveCorrection}
                  disabled={savingCorrection || !resultValue.trim()}
                >
                  {savingCorrection ? 'Saving…' : 'Save correction'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
              <p className="ve-inspect__edit-note">
                Saving marks this result <strong>Needs review</strong>. It must be confirmed
                again against the original document. Nothing is re-verified automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function totalPageCount(extraction: ExtractionResult | null): number {
  if (!extraction) return 0
  const pages = extraction.pages
  return Math.max(extraction.total_pages ?? 0, Array.isArray(pages) ? pages.length : 0, 1)
}
