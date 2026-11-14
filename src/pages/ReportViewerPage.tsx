import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  FileQuestion,
  Info,
  TriangleAlert,
} from 'lucide-react'
import { Button, ButtonLink } from '../components/Button'
import { PageContainer } from '../components/PageHeader'
import { StatusBadge, type StatusVariant } from '../components/StatusBadge'
import { ExplanationsPanel } from '../components/ExplanationsPanel'
import { ClinicianSummarySection } from '../components/ClinicianSummarySection'
import { FindCareSection } from '../components/FindCareSection'
import { usePageTitle } from '../lib/usePageTitle'
import {
  analyseReport,
  compareReports,
  getAnalysis,
  getExplanations,
  getExtraction,
  listMeasurements,
  listReports,
  structureReport,
  triggerExtraction,
  verifyMeasurement,
  type AnalysisResult,
  type ApiReport,
  type ComparisonResult,
  type ExplanationsResult,
  type ExtractionResult,
  type Measurement,
} from '../lib/api'

function MissingReport() {
  return (
    <>
      <Link className="viewer-back" to="/app/reports">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to my reports
      </Link>

      <div className="viewer-title-row">
        <div>
          <h1>Report unavailable</h1>
          <p>
            We couldn&apos;t find this report in your workspace. It may have been
            removed, the link may be outdated, or you may not have access on this
            device.
          </p>
        </div>
        <div className="viewer-badges">
          <StatusBadge variant="neutral" dot={false}>
            Report not found
          </StatusBadge>
        </div>
      </div>

      <div className="card viewer-panel">
        <div className="viewer-unavailable">
          <span className="viewer-unavailable__icon" aria-hidden="true">
            <FileQuestion size={24} strokeWidth={1.7} />
          </span>
          <h2>This report is not in your workspace.</h2>
          <p>
            LabLens never opens a report it cannot find, and it never fabricates
            one to fill the page. Try your report library, or upload the file
            again.
          </p>
          <div className="viewer-unavailable__actions">
            <ButtonLink to="/app/reports" variant="primary" size="sm">
              Back to my reports
            </ButtonLink>
            <ButtonLink to="/app/upload" variant="secondary" size="sm">
              Upload a report
            </ButtonLink>
          </div>
        </div>
      </div>
    </>
  )
}

function comparisonVariant(status: string): StatusVariant {
  switch (status) {
    case 'within_range':
      return 'lime'
    case 'below_range':
    case 'above_range':
    case 'incompatible_units':
    case 'review_required':
      return 'amber'
    default:
      return 'neutral'
  }
}

function ViewerReport({ reportId }: { reportId: string }) {
  const [extraction, setExtraction] = useState<ExtractionResult | null>(null)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [structuring, setStructuring] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [reports, setReports] = useState<ApiReport[]>([])
  const [compareTarget, setCompareTarget] = useState<string>('')
  const [comparison, setComparison] = useState<ComparisonResult | null>(null)
  const [comparing, setComparing] = useState(false)
  const [explanations, setExplanations] = useState<ExplanationsResult | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getExtraction(reportId)
      setExtraction(data)
    } catch {
      setExtraction(null)
    }
    try {
      const ms = await listMeasurements(reportId)
      setMeasurements(ms)
    } catch {
      setMeasurements([])
    }
    try {
      const a = await getAnalysis(reportId)
      if (a.status !== 'not_started') {
        setAnalysis(a)
        const exp = await getExplanations(reportId)
        setExplanations(exp)
      }
    } catch {
      setAnalysis(null)
      setExplanations(null)
    }
    try {
      const r = await listReports()
      setReports(r)
      setMissing(!r.some((report) => report.id === reportId))
    } catch {
      // The report list is optional chrome; absence alone doesn't mean the report is missing.
      setReports([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId])

  const handleExtract = async () => {
    setExtracting(true)
    setError(null)
    try {
      const data = await triggerExtraction(reportId)
      setExtraction(data)
      const ms = await listMeasurements(reportId)
      setMeasurements(ms)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const handleStructure = async () => {
    setStructuring(true)
    setError(null)
    try {
      await structureReport(reportId)
      const ms = await listMeasurements(reportId)
      setMeasurements(ms)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Structuring failed')
    } finally {
      setStructuring(false)
    }
  }

  const handleVerify = async (mid: string) => {
    try {
      const updated = await verifyMeasurement(reportId, mid)
      setMeasurements((prev) => prev.map((m) => (m.id === mid ? updated : m)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verify failed')
    }
  }

  const handleAnalyse = async () => {
    setAnalysing(true)
    setError(null)
    try {
      const a = await analyseReport(reportId)
      setAnalysis(a)
      try {
        const exp = await getExplanations(reportId)
        setExplanations(exp)
      } catch {
        // Explanations can be loaded asynchronously
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalysing(false)
    }
  }

  const handleCompare = async () => {
    if (!compareTarget) {
      setError('Select a previous report to compare.')
      return
    }
    setComparing(true)
    setError(null)
    try {
      const c = await compareReports([reportId, compareTarget])
      setComparison(c)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison failed')
    } finally {
      setComparing(false)
    }
  }

  if (missing && !loading) {
    return <MissingReport />
  }

  return (
    <>
      <Link className="viewer-back" to="/app/reports">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to my reports
      </Link>

      <div className="viewer-title-row">
        <div>
          <h1>Report extraction</h1>
          <p>
            Locally extracted text. No medical interpretation is performed.
          </p>
        </div>
        <div className="viewer-badges">
          <StatusBadge variant="mint" dot={false}>
            Stored locally
          </StatusBadge>
          {extraction ? (
            <StatusBadge variant="outline" dot={false}>
              {extraction.status}
            </StatusBadge>
          ) : null}
        </div>
      </div>

      <div className="card viewer-panel">
        <Button onClick={handleExtract} disabled={extracting} variant="primary" size="sm">
          {extracting ? 'Extracting…' : 'Extract document'}
        </Button>
        {error ? <p className="library-note">{error}</p> : null}
        {loading ? <p className="library-note">Loading…</p> : null}

        {extraction && extraction.pages.length > 0 ? (
          <div className="extraction-results">
            <p className="library-note">
              {extraction.total_pages} page(s) · method:{' '}
              {extraction.pages.map((p) => p.extraction_method).join(', ')}
            </p>
            {extraction.pages.map((page) => (
              <section key={page.page_number} className="extraction-page">
                <h3>Page {page.page_number}</h3>
                {page.warnings && page.warnings.length > 0 ? (
                  <p className="library-note">
                    ⚠ {page.warnings.join(' ')}
                  </p>
                ) : null}
                <pre className="extraction-text">{page.raw_text}</pre>
              </section>
            ))}
          </div>
        ) : extraction ? (
          <p className="library-note">No text extracted.</p>
        ) : null}

        {extraction ? (
          <div className="measurement-results">
            <Button onClick={handleStructure} disabled={structuring} variant="secondary" size="sm">
              {structuring ? 'Structuring…' : 'Structure measurements'}
            </Button>
            {measurements.length > 0 ? (
              <ul className="measurement-list">
                {measurements.map((m) => (
                  <li key={m.id} className="measurement-item">
                    <div>
                      <strong>{m.test_name_normalized}</strong>
                      <span>
                        {m.result_original} {m.unit_original ?? ''} · ref{' '}
                        {m.reference_range_original ?? '—'} · {m.derived_flag} ·{' '}
                        {m.verification_status}
                      </span>
                    </div>
                    {m.verification_status !== 'verified' ? (
                      <Button
                        variant="quiet"
                        size="sm"
                        onClick={() => handleVerify(m.id)}
                      >
                        Verify
                      </Button>
                    ) : (
                      <span className="measurement-verified">✓ verified</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}

            {measurements.length > 0 ? (
              <div className="analysis-results">
                <Button onClick={handleAnalyse} disabled={analysing} variant="primary" size="sm">
                  {analysing ? 'Analysing…' : 'Analyse health patterns'}
                </Button>
                {analysis && analysis.freshness === 'stale' ? (
                  <div className="analysis-stale" role="status">
                    <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
                    <p>
                      Measurements changed after this analysis was generated. The
                      previous summary is no longer current and is hidden until you
                      run analysis again.
                    </p>
                  </div>
                ) : null}
                {analysis && analysis.freshness !== 'stale' && analysis.summary ? (
                  <div className="analysis-summary">
                    <p className="library-note">
                      {analysis.summary.total_measurements} measurements ·{' '}
                      {analysis.summary.eligible_measurements} analysed ·{' '}
                      {analysis.summary.below_range} below · {analysis.summary.above_range} above ·{' '}
                      {analysis.summary.within_range} within · {analysis.summary.findings_count} findings
                    </p>
                    <p className="library-note">
                      Informational comparison against the laboratory reference interval only. This is not a medical diagnosis, and no health score or disease prediction is made.
                    </p>
                    {analysis.critical_flags && analysis.critical_flags.length > 0 ? (
                      <div className="analysis-critical" role="alert">
                        <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" />
                        <div>
                          <strong>Critical laboratory flag on record.</strong>
                          <p>
                            {analysis.critical_flags.map((f) => (
                              <span key={f.measurement_id}>
                                {f.test_name}
                                {f.value != null ? ` ${f.value}` : ''} {f.unit ?? ''} (flag: {f.lab_flag ?? 'critical'})
                                {f.source_page ? ` · page ${f.source_page}` : ''}.{' '}
                              </span>
                            ))}
                            Please contact your healthcare professional or the issuing laboratory immediately.
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {analysis.findings && analysis.findings.length > 0 ? (
                      <ul className="analysis-findings">
                        {analysis.findings.map((f) => (
                          <li key={f.id}>
                            <strong>{f.finding_code}</strong>
                            <span>{f.metadata?.description ?? 'Pattern finding'}</span>
                            {f.metadata?.limitations && f.metadata.limitations.length > 0 ? (
                              <span>{f.metadata.limitations.join(' ')}</span>
                            ) : null}
                            {f.metadata?.missing_context && f.metadata.missing_context.length > 0 ? (
                              <span>Missing context: {f.metadata.missing_context.join(', ')}</span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="library-note">No pattern findings triggered.</p>
                    )}
                  </div>
                ) : null}

                {analysis && analysis.freshness !== 'stale' && analysis.assessments && analysis.assessments.length > 0 ? (
                  <ul className="analysis-assessments">
                    {analysis.assessments.map((a) => (
                      <li key={a.measurement_id} className="analysis-assessment">
                        <div>
                          <strong>{a.test_name}</strong>
                          <span>
                            {a.value ?? '—'} {a.unit ?? ''} · ref {a.range ?? '—'} · flag {a.lab_flag ?? '—'}
                          </span>
                        </div>
                        <StatusBadge variant={comparisonVariant(a.comparison_status)}>
                          {a.comparison_status.replace(/_/g, ' ')}
                        </StatusBadge>
                        {a.source_page != null ? (
                          <span className="analysis-assessment__page">page {a.source_page}</span>
                        ) : null}
                        {a.limitations ? (
                          <p className="analysis-assessment__limitations">{a.limitations}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="analysis-comparison">
                  <h3>Historical comparison</h3>
                  {reports.length > 0 ? (
                    <div className="analysis-comparison__controls">
                      <label htmlFor="comparison-target">Compare with</label>
                      <select
                        id="comparison-target"
                        value={compareTarget}
                        onChange={(e) => setCompareTarget(e.target.value)}
                      >
                        <option value="">Select a previous report…</option>
                        {reports
                          .filter((r) => r.id !== reportId)
                          .map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.original_filename} · {r.created_at}
                            </option>
                          ))}
                      </select>
                      <Button onClick={handleCompare} disabled={comparing || !compareTarget} variant="secondary" size="sm">
                        {comparing ? 'Comparing…' : 'Compare'}
                      </Button>
                    </div>
                  ) : null}
                  {comparison && comparison.comparisons.length > 0 ? (
                    <ul className="comparison-list">
                      {comparison.comparisons.map((c, i) => (
                        <li key={`${c.test_name}-${i}`} className="comparison-item">
                          <div>
                            <strong>{c.test_name}</strong>
                            <span>
                              {c.previous.value ?? '—'} {c.previous.unit ?? ''} → {c.latest.value ?? '—'} {c.latest.unit ?? ''}
                            </span>
                            <span>
                              {c.absolute_difference != null
                                ? `Δ ${c.absolute_difference}`
                                : 'difference not calculated'}
                              {c.percentage_difference != null ? ` (${c.percentage_difference.toFixed(1)}%)` : ''}
                            </span>
                          </div>
                          <StatusBadge variant={c.unit_compatible ? comparisonVariant(c.status) : 'outline'}>
                            {c.status}
                          </StatusBadge>
                          {c.limitations && c.limitations.length > 0 ? (
                            <p className="comparison-item__limitations">{c.limitations.join(' ')}</p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {comparison ? <p className="library-note">{comparison.disclaimer}</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <p className="library-note">
        <Info size={11} aria-hidden="true" />
        <span>
          Extraction is local and may be imperfect. Always verify against the
          original document.
        </span>
      </p>

      {/* Phase 5 — Explanation Panel */}
      <ExplanationsPanel
        reportId={reportId}
        analysisCompleted={!!(analysis && analysis.status === 'completed')}
      />

      {/* Phase 6 — Clinician Handoff & Care Navigation */}
      <ClinicianSummarySection
        report={reports.find((r) => r.id === reportId) ?? null}
        measurements={measurements}
        analysis={analysis}
        explanations={explanations}
      />

      <FindCareSection />
    </>
  )
}

export function ReportViewerPage() {
  const { reportId } = useParams()
  usePageTitle('Report workspace — LabLens')

  return (
    <PageContainer>
      <ViewerReport key={reportId ?? 'report'} reportId={reportId ?? ''} />
    </PageContainer>
  )
}
