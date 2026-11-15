/**
 * Verification workspace selectors.
 * Pure functions derived exclusively from backend-reported measurement state.
 */

import type { Measurement } from './api'

export interface ReviewSummary {
  total: number
  confirmed: number
  needsReview: number
  outOfRange: number
  corrected: number
  /** Fraction of measurements confirmed so far (0..1); 0 for empty reports. */
  fraction: number
}

export function isConfirmed(measurement: Measurement): boolean {
  return measurement.verification_status === 'verified'
}

export function isCorrected(measurement: Measurement): boolean {
  return measurement.has_corrections === true
}

/** True only for genuinely out-of-range derived flags (backend vocabulary). */
export function isOutOfRange(measurement: Measurement): boolean {
  return (
    measurement.derived_flag === 'above_range' ||
    measurement.derived_flag === 'below_range'
  )
}

export function rangeFlagLabel(measurement: Measurement): string | null {
  switch (measurement.derived_flag) {
    case 'above_range':
      return 'Above laboratory range'
    case 'below_range':
      return 'Below laboratory range'
    case 'qualitative':
      return 'Qualitative result'
    case 'unknown':
      return 'Flag unknown'
    default:
      return null
  }
}

/** Mirror of the backend _is_critical(): exact tokens or contains "critical". */
export function isCritical(measurement: Measurement): boolean {
  const raw = measurement.lab_flag
  if (!raw) return false
  const token = String(raw).trim().toLowerCase()
  const criticalTokens = new Set([
    'critical',
    'crit',
    'critical value',
    'critical finding',
    'panic value',
  ])
  return criticalTokens.has(token) || token.includes('critical')
}

/** Display name with the normalised name preferred. */
export function displayName(measurement: Measurement): string {
  return (
    measurement.test_name_normalized ||
    measurement.test_name_original ||
    'Unknown result'
  )
}

export function summarize(measurements: Measurement[]): ReviewSummary {
  const total = measurements.length
  const confirmed = measurements.filter(isConfirmed).length
  const outOfRange = measurements.filter(isOutOfRange).length
  const corrected = measurements.filter(isCorrected).length
  const needsReview = total - confirmed
  return {
    total,
    confirmed,
    needsReview,
    outOfRange,
    corrected,
    fraction: total === 0 ? 0 : confirmed / total,
  }
}

/** Format an OCR confidence score (0..1) as a percentage string. */
export function formatOcrScore(confidence: number): string {
  return `${(confidence * 100).toFixed(1)}%`
}

/** Normalise a bbox (4-number box or 4-point polygon) to [x0, y0, x1, y1]. */
export function bboxBounds(box: unknown): [number, number, number, number] | null {
  if (!Array.isArray(box) || box.length === 0) return null
  if (typeof box[0] === 'number') {
    const [x0, y0, x1, y1] = box as number[]
    if (![x0, y0, x1, y1].every(Number.isFinite)) return null
    return [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]
  }
  const xs: number[] = []
  const ys: number[] = []
  for (const point of box) {
    if (!Array.isArray(point) || point.length < 2) return null
    if (![point[0], point[1]].every(Number.isFinite)) return null
    xs.push(Number(point[0]))
    ys.push(Number(point[1]))
  }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** Fraction (0..1) of the measurement's bbox covered by the item bbox. */
export function bboxOverlapRatio(
  measurement: [number, number, number, number],
  item: [number, number, number, number],
): number {
  const x0 = Math.max(measurement[0], item[0])
  const y0 = Math.max(measurement[1], item[1])
  const x1 = Math.min(measurement[2], item[2])
  const y1 = Math.min(measurement[3], item[3])
  const width = x1 - x0
  const height = y1 - y0
  if (width <= 0 || height <= 0) return 0
  const itemArea = (item[2] - item[0]) * (item[3] - item[1])
  return itemArea > 0 ? (width * height) / itemArea : 0
}

export function measurementConfidence(measurement: Measurement): number | null {
  const value = measurement.ocr_confidence
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function sourceMethodLabel(measurement: Measurement): string {
  switch (measurement.extraction_method) {
    case 'digital':
      return 'Digital text layer'
    case 'ocr':
      return 'OCR-rendered page (200 DPI)'
    default:
      return 'Unknown source'
  }
}
