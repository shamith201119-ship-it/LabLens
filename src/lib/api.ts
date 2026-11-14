const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://127.0.0.1:8000'

export interface ApiReport {
  id: string
  original_filename: string
  file_extension: string
  media_type: string
  file_size_bytes: number
  sha256_hash: string
  status: string
  consent_timestamp: string | null
  created_at: string
  updated_at: string
}

const UNAVAILABLE = 'LabLens could not connect to its local storage service. Please check that the backend is running on 127.0.0.1:8000.'

async function safeFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch {
    throw new Error(UNAVAILABLE)
  }
}

export async function apiHealth(): Promise<{ status: string }> {
  const res = await safeFetch(`${API_BASE}/api/health`)
  if (!res.ok) throw new Error('Backend unavailable')
  return res.json()
}

export async function listReports(): Promise<ApiReport[]> {
  const res = await safeFetch(`${API_BASE}/api/reports`)
  if (!res.ok) throw new Error('Failed to load reports')
  const data = await res.json()
  return data.reports ?? []
}

export async function getReport(id: string): Promise<ApiReport> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}`)
  if (!res.ok) throw new Error('Report not found')
  return res.json()
}

export async function uploadReport(file: File, consent: boolean): Promise<ApiReport> {
  const form = new FormData()
  form.append('file', file)
  form.append('consent', String(consent))
  const res = await safeFetch(`${API_BASE}/api/reports`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }))
    throw new Error(err.detail ?? 'Upload failed')
  }
  return res.json()
}

export async function deleteReport(id: string): Promise<void> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}`, { method: 'DELETE' })
  if (!res.ok && res.status !== 204) throw new Error('Delete failed')
}

export async function deleteAllReports(): Promise<number> {
  const res = await safeFetch(`${API_BASE}/api/reports`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Delete all failed')
  const data = await res.json()
  return data.deleted ?? 0
}

export function downloadUrl(id: string): string {
  return `${API_BASE}/api/reports/${id}/download`
}

export function pageImageUrl(id: string, pageNumber: number): string {
  return `${API_BASE}/api/reports/${id}/pages/${pageNumber}/image`
}

export interface ExtractionPage {
  page_number: number
  extraction_method: string
  raw_text: string | null
  metadata: unknown
  page_width: number | null
  page_height: number | null
  warnings: string[]
}

export interface ExtractionResult {
  job_id: string
  report_id: string
  status: string
  document_type: string | null
  total_pages: number
  processed_pages: number
  started_at: string | null
  completed_at: string | null
  error_code: string | null
  pages: ExtractionPage[]
}

export async function triggerExtraction(id: string): Promise<ExtractionResult> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}/extract`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Extraction failed' }))
    throw new Error(err.detail ?? 'Extraction failed')
  }
  // fetch full extraction
  return getExtraction(id)
}

export async function getExtraction(id: string): Promise<ExtractionResult> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}/extraction`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to load extraction' }))
    throw new Error(err.detail ?? 'Failed to load extraction')
  }
  return res.json()
}

export interface Measurement {
  id: string
  report_id: string
  test_name_original: string
  test_name_normalized: string
  test_code: string | null
  result_original: string
  result_numeric: number | null
  result_qualifier: string | null
  unit_original: string | null
  unit_normalized: string | null
  reference_range_original: string | null
  reference_low: number | null
  reference_high: number | null
  reference_unit: string | null
  lab_flag: string | null
  derived_flag: string | null
  page_number: number
  source_text: string | null
  source_bbox: [number, number, number, number] | null
  extraction_method: string
  ocr_confidence: number | null
  verification_status: string
  has_corrections: boolean
}

function normalizeMeasurement(measurement: Measurement): Measurement {
  const rawBbox: unknown = measurement.source_bbox
  const hasCorrections = Boolean(
    (measurement as Measurement & { has_corrections?: unknown }).has_corrections,
  )
  const withCorrections = { ...measurement, has_corrections: hasCorrections }

  if (rawBbox === null) return withCorrections

  let parsed: unknown = rawBbox
  if (typeof rawBbox === 'string') {
    try {
      parsed = JSON.parse(rawBbox)
    } catch {
      parsed = null
    }
  }

  if (
    Array.isArray(parsed) &&
    parsed.length === 4 &&
    parsed.every((value) => typeof value === 'number' && Number.isFinite(value))
  ) {
    return {
      ...withCorrections,
      source_bbox: parsed as [number, number, number, number],
    }
  }
  return { ...withCorrections, source_bbox: null }
}

export async function structureReport(id: string): Promise<{ measurements_saved: number }> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}/structure`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Structuring failed' }))
    throw new Error(err.detail ?? 'Structuring failed')
  }
  return res.json()
}

export async function listMeasurements(id: string): Promise<Measurement[]> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}/measurements`)
  if (!res.ok) throw new Error('Failed to load measurements')
  const data = await res.json()
  return (data.measurements ?? []).map(normalizeMeasurement)
}

export async function patchMeasurement(id: string, measurementId: string, patch: Record<string, unknown>): Promise<Measurement> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}/measurements/${measurementId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Update failed' }))
    throw new Error(err.detail ?? 'Update failed')
  }
  return normalizeMeasurement(await res.json())
}

export async function verifyMeasurement(id: string, measurementId: string): Promise<Measurement> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}/measurements/${measurementId}/verify`, { method: 'POST' })
  if (!res.ok) throw new Error('Verify failed')
  return normalizeMeasurement(await res.json())
}

export interface VerifySelectedResult {
  verified: number
  measurements: Measurement[]
}

export async function verifySelectedMeasurements(
  id: string,
  measurementIds: string[],
): Promise<VerifySelectedResult> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}/measurements/verify-selected`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ measurement_ids: measurementIds }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Verification failed' }))
    throw new Error(err.detail ?? 'Verification failed')
  }
  const data = await res.json()
  return {
    verified: typeof data.verified === 'number' ? data.verified : measurementIds.length,
    measurements: (data.measurements ?? []).map(normalizeMeasurement),
  }
}

export interface AnalysisSummary {
  total_measurements: number
  eligible_measurements: number
  supported_measurements: number
  needs_review: number
  unsupported: number
  below_range: number
  above_range: number
  within_range: number
  qualitative: number
  unavailable: number
  incompatible_units: number
  review_required: number
  critical_flags: number
  findings_count: number
}

export interface AnalysisAssessment {
  measurement_id: string
  test_name: string
  value: string | null
  unit: string | null
  range: string | null
  lab_flag: string | null
  comparison_status: string
  limitations: string
  metadata: Record<string, unknown> | null
  source_page: number | null
}

export interface AnalysisFindingMeasurement {
  measurement_id: string
  test_name: string
  value: string | null
  unit: string | null
  range: string | null
  comparison_status: string
  source_page: number | null
}

export interface AnalysisFinding {
  id: string
  rule_id: string
  finding_code: string
  evidence_measurement_ids: string[]
  evidence_reference_ids: string[] | null
  metadata: {
    description: string
    recommendation_language?: string
    reference: string
    review_status?: string
    rule_version?: string
    engine_version?: string
    patient_context_required?: boolean
    patient_context_needed?: string[]
    missing_context?: string[]
    limitations?: string[]
    measurements?: AnalysisFindingMeasurement[]
  } | null
  created_at?: string
}

export interface CriticalFlag {
  measurement_id: string
  test_name: string
  value: string | null
  unit: string | null
  lab_flag: string | null
  source_page: number | null
  comparison_status: string | null
}

export interface AnalysisResult {
  analysis_id: string
  report_id: string
  engine_version: string
  rule_set_version: string
  status: string
  freshness?: 'current' | 'stale' | 'not_started'
  freshness_reason?: string | null
  started_at?: string | null
  completed_at?: string | null
  summary: AnalysisSummary | null
  assessments: AnalysisAssessment[]
  findings: AnalysisFinding[]
  critical_flags: CriticalFlag[]
}

export async function analyseReport(id: string): Promise<AnalysisResult> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}/analyse`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Analysis failed' }))
    throw new Error(err.detail ?? 'Analysis failed')
  }
  const post = await res.json()
  const latest = await getAnalysis(id)
  // POST returns the just-created run (with summary); GET returns the most recent stored run.
  return { ...latest, summary: post.summary ?? latest.summary ?? null }
}

export async function getAnalysis(id: string): Promise<AnalysisResult> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}/analysis`)
  if (!res.ok) throw new Error('Failed to load analysis')
  return res.json()
}

export interface MeasurementComparison {
  test_name: string
  previous: { report_id: string; value: string | null; numeric: number | null; unit: string | null; range: string | null; created_at: string | null }
  latest: { report_id: string; value: string | null; numeric: number | null; unit: string | null; range: string | null; created_at: string | null }
  status: string
  unit_compatible: boolean
  absolute_difference: number | null
  percentage_difference: number | null
  limitations: string[]
}

export interface ComparisonResult {
  report_ids: string[]
  comparisons: MeasurementComparison[]
  disclaimer: string
}

// ─── Phase 5 — Explanations ────────────────────────────────────────────────

export interface ExplanationSource {
  id: string
  title: string
  publisher: string
  url: string
}

export interface MeasurementExplanation {
  measurement_id: string
  test_name: string
  value: string | null
  unit: string | null
  reference_range: string | null
  comparison_status: string
  lab_flag: string | null
  is_critical: boolean
  is_unverified: boolean
  what_it_measures: string
  why_doctors_look_at_it: string
  result_description: string
  possible_influences: string[]
  cannot_establish: string
  context_factors: string[]
  discussion_questions: string[]
  sources: ExplanationSource[]
}

export interface PatternExplanation {
  finding_id: string
  rule_id: string
  finding_code: string
  plain_title: string
  description: string
  plain_description: string
  why_grouped: string
  what_to_discuss: string
  recommendation_language: string
  patient_context_needed: string[]
  missing_context: string[]
  limitations: string[]
  measurements: Array<{
    measurement_id: string
    test_name: string
    value: string | null
    unit: string | null
    range: string | null
    comparison_status: string
    source_page: number | null
  }>
  sources: ExplanationSource[]
  has_catalogue_entry: boolean
}

export interface ExplanationsSummary {
  total_assessments: number
  within_range: number
  above_range: number
  below_range: number
  unverified_or_needs_review: number
  supported_patterns: number
  critical_flags: number
}

export interface ExplanationsResult {
  catalogue_version: string
  report_id: string
  analysis_status: string
  analysis_freshness?: string
  summary: ExplanationsSummary
  measurements: MeasurementExplanation[]
  patterns: PatternExplanation[]
  disclaimer: string
}

export async function getExplanations(id: string): Promise<ExplanationsResult> {
  const res = await safeFetch(`${API_BASE}/api/reports/${id}/explanations`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to load explanations' }))
    throw new Error(err.detail ?? 'Failed to load explanations')
  }
  return res.json()
}

// ─── Phase 7 — Personal Lab History & Longitudinal Trends ──────────────────

export interface TimelineReportEntry {
  report_id: string
  filename: string | null
  upload_date: string | null
  report_date: string | null
  effective_date: string | null
  date_provenance: 'sample_date' | 'upload_date'
  extraction_status: string
  analysis_status: string
  analysis_freshness?: string
  measurement_count: number
  critical_flags_count: number
}

export interface BiomarkerSummaryItem {
  test_name: string
  test_code: string | null
  category: string
  observation_count: number
}

export interface HistoryOverviewResult {
  total_reports: number
  reports_with_measurements: number
  timeline: TimelineReportEntry[]
  available_biomarkers: BiomarkerSummaryItem[]
  disclaimer: string
}

export async function getHistoryOverview(): Promise<HistoryOverviewResult> {
  const res = await safeFetch(`${API_BASE}/api/history`)
  if (!res.ok) throw new Error('Failed to load lab history')
  return res.json()
}

export interface BiomarkerObservation {
  measurement_id: string
  report_id: string
  filename: string | null
  date: string | null
  date_provenance: 'sample_date' | 'upload_date'
  test_name_original: string
  value_original: string
  value_numeric: number | null
  unit: string | null
  reference_range: string | null
  reference_low: number | null
  reference_high: number | null
  lab_flag: string | null
  derived_flag: string | null
  verification_status: string
  trend_eligible: boolean
  exclusion_reason: string | null
  page_number: number
}

export interface BiomarkerDifference {
  earlier_value: number
  latest_value: number
  unit: string | null
  absolute_change: number
  percentage_change: number | null
  direction: 'higher' | 'lower' | 'unchanged'
}

export interface BiomarkerTrendSummary {
  eligible_count: number
  needs_review_count: number
  recorded_difference: BiomarkerDifference | null
  status_message: string
}

export interface BiomarkerHistoryResult {
  test_name: string
  category: string
  total_observations: number
  observations: BiomarkerObservation[]
  summary: BiomarkerTrendSummary
  disclaimer: string
}

export async function getBiomarkerHistory(biomarkerName: string): Promise<BiomarkerHistoryResult> {
  const res = await safeFetch(`${API_BASE}/api/history/biomarkers/${encodeURIComponent(biomarkerName)}`)
  if (!res.ok) throw new Error('Failed to load biomarker history')
  return res.json()
}

export async function compareHistoryReports(reportIds: string[]): Promise<ComparisonResult> {
  const res = await safeFetch(`${API_BASE}/api/history/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_ids: reportIds }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Comparison failed' }))
    throw new Error(err.detail ?? 'Comparison failed')
  }
  return res.json()
}

export async function compareReports(reportIds: string[]): Promise<ComparisonResult> {
  const res = await safeFetch(`${API_BASE}/api/reports/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report_ids: reportIds }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Comparison failed' }))
    throw new Error(err.detail ?? 'Comparison failed')
  }
  return res.json()
}
