import type { CSSProperties, ReactNode } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Download,
  TriangleAlert,
} from 'lucide-react'
import type { ApiReport, ExtractionResult } from '../../lib/api'
import { downloadUrl } from '../../lib/api'
import { DocumentStage, type RenderedImageSize } from './DocumentStage'

export type { RenderedImageSize }

interface SourcePanelProps {
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
  hiddenOnMobile: boolean
  emptyHint?: string
  /** Optional overlay content docked inside the document viewport (inspection panel). */
  dockedContent?: ReactNode
}

const DOCUMENT_TYPE: Record<string, string> = {
  pdf: 'PDF',
  jpg: 'Photo',
  jpeg: 'Photo',
  png: 'Image',
}

/**
 * Evidence panel: rendered original page with the selected measurement's
 * source region highlighted. Zoom, pan and page navigation live in
 * DocumentStage so image and overlay stay aligned.
 */
export function SourcePanel({
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
  hiddenOnMobile,
  emptyHint,
  dockedContent,
}: SourcePanelProps) {
  const docType = report
    ? DOCUMENT_TYPE[report.file_extension.toLowerCase()] ?? report.file_extension.toUpperCase()
    : 'Report'

  return (
    <section
      id="ve-panel-document"
      className={`ve-source${hiddenOnMobile ? ' ve-mobile-hidden' : ''}`}
      aria-label="Original report preview"
    >
      <div className="ve-source__toolbar">
        <div className="ve-source__meta">
          <span className="ve-source__filename" title={report?.original_filename}>
            {report?.original_filename}
          </span>
          <span className="ve-source__doctype">{docType}</span>
        </div>

        {totalPages > 1 ? (
          <div className="ve-source__pagination" aria-label="Page navigation">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, activePage - 1))}
              disabled={activePage <= 1}
              className="ve-icon-btn ve-icon-btn--small"
              aria-label="Previous page"
            >
              <ChevronLeft size={14} aria-hidden="true" />
            </button>
            <span className="ve-source__page-label">
              {activePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, activePage + 1))}
              disabled={activePage >= totalPages}
              className="ve-icon-btn ve-icon-btn--small"
              aria-label="Next page"
            >
              <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <div className="ve-source__switch">
          <button
            type="button"
            className={`ve-toggle${docViewMode === 'preview' ? ' is-active' : ''}`}
            onClick={() => onDocViewModeChange('preview')}
          >
            Visual
          </button>
          <button
            type="button"
            className={`ve-toggle${docViewMode === 'ocr' ? ' is-active' : ''}`}
            onClick={() => onDocViewModeChange('ocr')}
          >
            OCR text
          </button>
          {reportId ? (
            <a
              href={downloadUrl(reportId)}
              download={report?.original_filename}
              className="ve-icon-btn ve-icon-btn--small"
              title="Download original file"
              aria-label="Download original file"
            >
              <Download size={13} aria-hidden="true" />
            </a>
          ) : null}
        </div>
      </div>

      <div
        className={`ve-source__viewport${dockedContent ? ' ve-source__viewport--docked' : ''}`}
      >
        {docViewMode === 'preview' ? (
          reportId ? (
            imageSource ? (
              <DocumentStage
                imageSrc={imageSource}
                alt={
                  isOcrPdfPage
                    ? `Scanned laboratory report page ${activePage}`
                    : 'Original lab report document'
                }
                highlightStyle={highlightStyle}
                onImageLoad={onImageLoad}
                activePage={activePage}
              />
            ) : (
              <iframe
                src={downloadUrl(reportId)}
                title="Original laboratory report document"
                className="ve-source__iframe"
              />
            )
          ) : (
            <p className="ve-source__missing">{emptyHint ?? 'Report file not found.'}</p>
          )
        ) : (
          <div className="ve-source__ocr">
            {currentPageExtraction?.warnings &&
            currentPageExtraction.warnings.length > 0 ? (
              <div className="ve-source__warnings">
                <TriangleAlert size={13} aria-hidden="true" />
                <span>{currentPageExtraction.warnings.join(' · ')}</span>
              </div>
            ) : null}
            <pre className="ve-source__ocr-text">
              {currentPageExtraction?.raw_text ||
                'No raw text recorded for this page.'}
            </pre>
          </div>
        )}

        {dockedContent ? (
          <div className="ve-source__docked">{dockedContent}</div>
        ) : null}
      </div>

      <div className="ve-source__legend">
        <span className="ve-source__legend-swatch" aria-hidden="true" />
        <span>Highlighted region = selected result</span>
      </div>
    </section>
  )
}
