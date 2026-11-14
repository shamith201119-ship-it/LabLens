/**
 * Execution-mode summary for the live processing experience.
 *
 * Derives what actually happened — GPU OCR, CPU OCR, CPU after a GPU failure,
 * direct digital text extraction — strictly from per-page backend metadata.
 * Nothing is assumed; when runtime information is missing the summary is null
 * and no execution label is rendered.
 */

import type { ExtractionPage, ExtractionResult } from './api'

export type PageExecutionKind =
  | 'direct'
  | 'gpu'
  | 'cpu'
  | 'cpu_fallback'
  | 'unknown'

export type ExecutionKind =
  | 'gpu'
  | 'cpu'
  | 'gpu_fallback'
  | 'mixed'
  | 'direct'

export interface PageExecution {
  page: number
  kind: PageExecutionKind
}

export interface ExecutionSummary {
  kind: ExecutionKind
  headline: string
  detail: string | null
  pageBreakdown: string | null
  pages: PageExecution[]
  gpuPages: number
  cpuPages: number
  fallbackPages: number
  directPages: number
  ocrPages: number
  totalPages: number
}

export interface OcrRuntimeMetadata {
  requested?: string | null
  device?: string | null
  actual?: string | null
  selection_reason?: string | null
  cpu_threads?: number | null
  text_recognition_batch_size?: number | null
  models?: {
    detection?: string | null
    recognition?: string | null
  } | null
  detection_limit_side_len?: number | null
  detection_limit_type?: string | null
  precision?: string | null
  mkl_dnn_enabled?: boolean | null
  fallback_occurred?: boolean | null
  fallback_reason?: string | null
  vram_bytes?: number | null
}

/** Read the runtime marker attached by the backend, if present. */
export function readOcrRuntime(page: ExtractionPage): OcrRuntimeMetadata | null {
  const metadata = page.metadata
  if (!metadata || typeof metadata !== 'object') return null
  const candidate = (metadata as Record<string, unknown>).ocr_runtime
  if (!candidate || typeof candidate !== 'object') return null
  return candidate as OcrRuntimeMetadata
}

function pageKind(page: ExtractionPage): PageExecutionKind {
  if (page.extraction_method === 'digital') return 'direct'
  const runtime = readOcrRuntime(page)
  if (!runtime) return 'unknown'
  if (runtime.fallback_occurred) return 'cpu_fallback'
  if (runtime.device === 'gpu') return 'gpu'
  if (runtime.device === 'cpu') return 'cpu'
  return 'unknown'
}

function pageLabel(kind: PageExecutionKind): string {
  switch (kind) {
    case 'direct':
      return 'Direct text'
    case 'gpu':
      return 'GPU OCR'
    case 'cpu':
      return 'CPU OCR'
    case 'cpu_fallback':
      return 'CPU OCR (fallback)'
    default:
      return 'Unknown'
  }
}

function buildBreakdown(pages: PageExecution[]): string | null {
  if (pages.length === 0) return null
  if (pages.length <= 5) {
    return pages.map((p) => `Page ${p.page} · ${pageLabel(p.kind)}`).join('  ·  ')
  }
  const tally: Record<string, number> = {}
  for (const p of pages) {
    const label = pageLabel(p.kind)
    tally[label] = (tally[label] ?? 0) + 1
  }
  return Object.entries(tally)
    .map(([label, count]) => `${count}× ${label}`)
    .join('  ·  ')
}

/**
 * Summarize runtime information for the whole document.
 *
 * Returns null when no page carries runtime metadata (e.g. legacy extractions),
 * so the UI never fabricates an execution mode.
 */
export function summarizeExtraction(
  extraction: ExtractionResult | null,
): ExecutionSummary | null {
  if (!extraction || extraction.pages.length === 0) return null

  const pages: PageExecution[] = extraction.pages.map((page) => ({
    page: page.page_number,
    kind: pageKind(page),
  }))

  const totalPages = pages.length
  const known = pages.filter((p) => p.kind !== 'unknown')
  if (known.length === 0) return null

  const directPages = pages.filter((p) => p.kind === 'direct').length
  const gpuPages = pages.filter((p) => p.kind === 'gpu').length
  const cpuPages = pages.filter((p) => p.kind === 'cpu').length
  const fallbackPages = pages.filter((p) => p.kind === 'cpu_fallback').length
  const ocrPages = gpuPages + cpuPages + fallbackPages

  const facts = { pages, directPages, gpuPages, cpuPages, fallbackPages, ocrPages, totalPages }

  if (ocrPages === 0) {
    return {
      kind: 'direct',
      headline: 'Direct PDF text extraction · No OCR required',
      detail: 'The text layer was read straight from the PDF. No OCR was run.',
      pageBreakdown: buildBreakdown(pages),
      ...facts,
    }
  }

  let kind: ExecutionKind
  let headline: string
  let detail: string | null

  if (fallbackPages > 0) {
    kind = 'gpu_fallback'
    headline = 'GPU unavailable · Continuing with CPU'
    detail =
      'GPU processing was not used for this report. Reading is continuing on this computer with CPU.'
  } else if (gpuPages > 0 && cpuPages === 0 && directPages === 0) {
    kind = 'gpu'
    headline = 'Accelerated processing · GPU'
    detail = null
  } else if (gpuPages > 0) {
    kind = 'mixed'
    headline = 'Local processing · Mixed CPU and GPU pages'
    detail =
      directPages > 0
        ? `${directPages} ${directPages === 1 ? 'page' : 'pages'} read directly from PDF text; ${gpuPages} on GPU OCR; ${cpuPages} on CPU OCR.`
        : `${gpuPages} ${gpuPages === 1 ? 'page' : 'pages'} on GPU OCR; ${cpuPages} on CPU OCR.`
  } else {
    kind = 'cpu'
    headline = 'Local processing · CPU'
    detail = directPages > 0
      ? `${directPages} ${directPages === 1 ? 'page' : 'pages'} read directly from PDF text; remaining ${cpuPages} on CPU OCR. This computer is using CPU processing — reading your report may take longer depending on your hardware.`
      : 'This computer is using CPU processing. Reading your report may take longer depending on your hardware.'
  }

  const parts: string[] = []
  if (directPages > 0 && kind !== 'cpu' && kind !== 'mixed') {
    parts.push(
      `${directPages} ${directPages === 1 ? 'page' : 'pages'} read directly from PDF text`,
    )
  }
  if (fallbackPages > 0) {
    parts.push(
      `${fallbackPages} ${fallbackPages === 1 ? 'page' : 'pages'} retried on CPU after a GPU failure`,
    )
  }
  if (parts.length > 0) {
    detail = [detail, ...parts].filter(Boolean).join(' · ')
  }

  return {
    kind,
    headline,
    detail,
    pageBreakdown: buildBreakdown(pages),
    ...facts,
  }
}
