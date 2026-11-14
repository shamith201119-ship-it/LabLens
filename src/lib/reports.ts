/**
 * Report domain types for the future FastAPI integration.
 *
 * No report records are fabricated or persisted in Phase 1. The UI reads from
 * this empty collection and is already shaped to consume the same types from an
 * API in Phase 2.
 */

export type ReportStatus = 'processing' | 'ready' | 'needs_review'

export type MeasurementFlag = 'within' | 'below' | 'above' | 'unknown'

export interface ReportSummary {
  id: string
  title: string
  laboratory: string | null
  collectedOn: string | null
  addedOn: string
  status: ReportStatus
  measurementCount: number | null
}

export interface Measurement {
  id: string
  name: string
  plainLanguageName: string
  value: number
  unit: string
  referenceRange: string | null
  flag: MeasurementFlag
}

export interface ReportDetail extends ReportSummary {
  measurements: Measurement[]
  sourceFileName: string | null
  processedAt: string | null
}

/**
 * Phase 2: replace with a fetch against the report API.
 * Example: `GET /api/reports` -> ReportSummary[]
 */
export const reportSummaries: ReportSummary[] = []
