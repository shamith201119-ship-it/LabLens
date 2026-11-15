import { useRef, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { ApiReport, ExtractionResult } from '../../lib/api'
import { SourcePanel, type RenderedImageSize } from './SourcePanel'
import { useDialogBehavior } from './useDialogBehavior'

interface ReportViewerProps {
  reportId?: string
  report: ApiReport | null
  totalPages: number
  activePage: number
  onPageChange: (page: number) => void
  docViewMode: 'preview' | 'ocr'
  onDocViewModeChange: (mode: 'preview' | 'ocr') => void
  isOcrPdfPage: boolean
  imageSource: string | null
  currentPageExtraction: ExtractionResult['pages'][number] | undefined
  highlightStyle: CSSProperties | null
  onImageLoad: (size: RenderedImageSize) => void
  /** Measurement name when opened from a card, otherwise the file name. */
  title: string
  /** Focus returns here when no opener element survives the close. */
  restoreSelector?: string
  onClose: () => void
}

/**
 * The original report, opened on demand. Wraps the existing SourcePanel and
 * DocumentStage unchanged, so zoom, pan, page navigation, digital-PDF rendering
 * and scanned-page highlighting behave exactly as before.
 */
export function ReportViewer({
  reportId,
  report,
  totalPages,
  activePage,
  onPageChange,
  docViewMode,
  onDocViewModeChange,
  isOcrPdfPage,
  imageSource,
  currentPageExtraction,
  highlightStyle,
  onImageLoad,
  title,
  restoreSelector,
  onClose,
}: ReportViewerProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useDialogBehavior(dialogRef, onClose, restoreSelector)

  return createPortal(
    <div className="ve-modal-root">
      <div className="ve-modal-backdrop" aria-hidden="true" onClick={onClose} />
      <div
        ref={dialogRef}
        className="ve-modal ve-modal--doc"
        role="dialog"
        aria-modal="true"
        aria-label="Original laboratory report"
        tabIndex={-1}
      >
        <header className="ve-modal__head">
          <div className="ve-modal__titles">
            <p className="ve-modal__eyebrow">Original report</p>
            <h2 className="ve-modal__title" title={title}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="ve-icon-btn ve-icon-btn--small"
            onClick={onClose}
            aria-label="Close original report"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="ve-modal__body">
          <SourcePanel
            reportId={reportId}
            report={report}
            totalPages={totalPages}
            activePage={activePage}
            onPageChange={onPageChange}
            docViewMode={docViewMode}
            onDocViewModeChange={onDocViewModeChange}
            isOcrPdfPage={isOcrPdfPage}
            imageSource={imageSource}
            currentPageExtraction={currentPageExtraction}
            highlightStyle={highlightStyle}
            onImageLoad={onImageLoad}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}
