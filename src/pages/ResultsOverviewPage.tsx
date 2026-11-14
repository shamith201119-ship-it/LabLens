import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Info,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react'
import { ButtonLink } from '../components/Button'
import { PageContainer } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { MeasurementResultCard } from '../components/MeasurementResultCard'
import { FindCareSection } from '../components/FindCareSection'
import { ClinicianSummarySection } from '../components/ClinicianSummarySection'
import { usePageTitle } from '../lib/usePageTitle'
import {
  getAnalysis,
  getExplanations,
  listMeasurements,
  listReports,
  type AnalysisAssessment,
  type AnalysisResult,
  type ApiReport,
  type ExplanationsResult,
  type Measurement,
  type MeasurementExplanation,
} from '../lib/api'

function groupAssessments(assessments: AnalysisAssessment[]) {
  const withinRange: AnalysisAssessment[] = []
  const outsideRange: AnalysisAssessment[] = []
  const needsReview: AnalysisAssessment[] = []

  for (const a of assessments) {
    if (a.comparison_status === 'within_range') {
      withinRange.push(a)
    } else if (
      a.comparison_status === 'above_range' ||
      a.comparison_status === 'below_range'
    ) {
      outsideRange.push(a)
    } else {
      needsReview.push(a)
    }
  }

  return { withinRange, outsideRange, needsReview }
}

function SummaryTile({
  count,
  label,
  variant,
}: {
  count: number
  label: string
  variant: 'lime' | 'amber' | 'critical' | 'neutral'
}) {
  return (
    <div className={`results-tile results-tile--${variant}`}>
      <span className="results-tile__count">{count}</span>
      <span className="results-tile__label">{label}</span>
    </div>
  )
}

function AssessmentSection({
  title,
  assessments,
  explanations,
  criticalIds,
  defaultOpen = false,
}: {
  title: string
  assessments: AnalysisAssessment[]
  explanations: MeasurementExplanation[]
  criticalIds: Set<string>
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (assessments.length === 0) return null

  const expMap = new Map(explanations.map((e) => [e.measurement_id, e]))

  return (
    <section className="results-section">
      <button
        type="button"
        className="results-section__toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <h2 className="results-section__title">{title}</h2>
        <span className="results-section__count">{assessments.length}</span>
        <span className="results-section__chevron" aria-hidden="true">
          {open ? '↑' : '↓'}
        </span>
      </button>
      {open ? (
        <div className="results-section__cards">
          {assessments.map((a) => (
            <MeasurementResultCard
              key={a.measurement_id}
              assessment={a}
              explanation={expMap.get(a.measurement_id)}
              isCritical={criticalIds.has(a.measurement_id)}
            />
          ))}
        </div>
      ) : null}
    </section>
  )
}

export function ResultsOverviewPage() {
  const { reportId } = useParams()
  usePageTitle('Results — LabLens')

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [explanations, setExplanations] = useState<ExplanationsResult | null>(null)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [reports, setReports] = useState<ApiReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!reportId) return
    const t = window.setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const [a, ms, rs] = await Promise.all([
          getAnalysis(reportId),
          listMeasurements(reportId),
          listReports(),
        ])
        setAnalysis(a)
        setMeasurements(ms)
        setReports(rs)
        if (a.status === 'completed') {
          try {
            const exp = await getExplanations(reportId)
            setExplanations(exp)
          } catch {
            // explanations optional
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load results')
      } finally {
        setLoading(false)
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [reportId])

  if (!reportId) {
    return (
      <PageContainer>
        <p className="library-note">No report specified.</p>
      </PageContainer>
    )
  }

  const currentReport = reports.find((r) => r.id === reportId) ?? null

  const currentCriticalMeasurements = measurements.filter(
    (m) =>
      m.lab_flag &&
      (m.lab_flag.toLowerCase().includes('crit') ||
        m.lab_flag.toLowerCase().includes('panic')),
  )

  if (loading) {
    return (
      <PageContainer>
        <div className="results-loading">
          <span className="pe-spinner" />
          <p>Loading your results…</p>
        </div>
      </PageContainer>
    )
  }

  if (error) {
    return (
      <PageContainer>
        <Link className="viewer-back" to={`/app/reports/${reportId}`}>
          <ArrowLeft size={14} aria-hidden="true" />
          Back to report
        </Link>
        <div className="results-error" role="alert">
          <TriangleAlert size={20} strokeWidth={1.8} />
          <p>{error}</p>
          <ButtonLink to={`/app/reports/${reportId}`} variant="secondary" size="sm">
            Open report workspace
          </ButtonLink>
        </div>
      </PageContainer>
    )
  }

  if (!analysis || analysis.status === 'not_started') {
    return (
      <PageContainer>
        <Link className="viewer-back" to={`/app/reports/${reportId}`}>
          <ArrowLeft size={14} aria-hidden="true" />
          Back to report
        </Link>
        <div className="results-not-ready">
          <Info size={20} strokeWidth={1.8} aria-hidden="true" />
          <h2>Analysis not complete</h2>
          <p>
            This report has not been analysed yet. Open the report workspace to
            extract measurements and run analysis first.
          </p>
          <ButtonLink to={`/app/reports/${reportId}`} variant="lime">
            Open report workspace
            <ArrowRight size={14} aria-hidden="true" />
          </ButtonLink>
        </div>
      </PageContainer>
    )
  }

  if (analysis.freshness === 'stale') {
    return (
      <PageContainer>
        <Link className="viewer-back" to={`/app/reports/${reportId}`}>
          <ArrowLeft size={14} aria-hidden="true" />
          Back to report workspace
        </Link>

        <div className="results-header">
          <div className="results-header__text">
            <p className="results-header__eyebrow">Your results</p>
            <h1 className="results-header__title">Your report, explained.</h1>
            {currentReport ? (
              <p className="results-header__filename">{currentReport.original_filename}</p>
            ) : null}
          </div>
          <div className="results-header__badges">
            <StatusBadge variant="amber">Analysis needs refresh</StatusBadge>
          </div>
        </div>

        {currentCriticalMeasurements.length > 0 ? (
          <div className="results-critical-alert" role="alert">
            <div className="results-critical-alert__head">
              <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />
              <strong>Critical laboratory flag on record</strong>
            </div>
            <p>
              One or more current measurements carry a critical or panic flag from
              the issuing laboratory. Please contact your healthcare professional or
              the issuing laboratory promptly.
            </p>
            <ul className="results-critical-list">
              {currentCriticalMeasurements.map((m) => (
                <li key={m.id}>
                  <strong>{m.test_name_normalized}</strong>
                  {m.result_original ? ` — ${m.result_original}` : ''}
                  {m.unit_original ? ` ${m.unit_original}` : ''}
                  {m.lab_flag ? ` (flag: ${m.lab_flag})` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="results-stale-alert" role="alert">
          <div className="results-stale-alert__head">
            <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />
            <strong>This analysis is out of date</strong>
          </div>
          <p>
            Measurements for this report changed after this analysis was generated,
            so the previous summary is no longer current and is not shown as health
            guidance. Re-verify the corrected measurements, then run analysis again
            to refresh your results.
          </p>
          <ButtonLink to={`/app/reports/${reportId}`} variant="primary" size="sm">
            Open report workspace
            <ArrowRight size={14} aria-hidden="true" />
          </ButtonLink>
        </div>
      </PageContainer>
    )
  }

  const { withinRange, outsideRange, needsReview } = groupAssessments(
    analysis.assessments ?? [],
  )

  const criticalIds = new Set(
    (analysis.critical_flags ?? []).map((f) => f.measurement_id),
  )

  const expMeasurements = explanations?.measurements ?? []
  const summary = analysis.summary

  return (
    <PageContainer>
      {/* Back navigation */}
      <Link className="viewer-back" to={`/app/reports/${reportId}`}>
        <ArrowLeft size={14} aria-hidden="true" />
        Back to report workspace
      </Link>

      {/* Page header */}
      <div className="results-header">
        <div className="results-header__text">
          <p className="results-header__eyebrow">Your results</p>
          <h1 className="results-header__title">Your report, explained.</h1>
          {currentReport ? (
            <p className="results-header__filename">{currentReport.original_filename}</p>
          ) : null}
        </div>
        <div className="results-header__badges">
          <StatusBadge variant="mint" dot={false}>
            Analysis complete
          </StatusBadge>
          {analysis.critical_flags && analysis.critical_flags.length > 0 ? (
            <StatusBadge variant="critical">
              {analysis.critical_flags.length} critical flag{analysis.critical_flags.length > 1 ? 's' : ''}
            </StatusBadge>
          ) : null}
        </div>
      </div>

      {/* Critical flags alert */}
      {analysis.critical_flags && analysis.critical_flags.length > 0 ? (
        <div className="results-critical-alert" role="alert">
          <div className="results-critical-alert__head">
            <TriangleAlert size={18} strokeWidth={2} aria-hidden="true" />
            <strong>Critical laboratory flag on record</strong>
          </div>
          <p>
            One or more results carry a critical flag from the issuing laboratory.
            Please contact your healthcare professional or the issuing laboratory promptly.
          </p>
          <ul className="results-critical-list">
            {analysis.critical_flags.map((f) => (
              <li key={f.measurement_id}>
                <strong>{f.test_name}</strong>
                {f.value != null ? ` — ${f.value}` : ''}
                {f.unit ? ` ${f.unit}` : ''}
                {f.lab_flag ? ` (flag: ${f.lab_flag})` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Summary tiles */}
      {summary ? (
        <div className="results-tiles">
          <SummaryTile
            count={summary.total_measurements}
            label="Total results"
            variant="neutral"
          />
          <SummaryTile
            count={summary.within_range}
            label="Within range"
            variant="lime"
          />
          <SummaryTile
            count={summary.above_range + summary.below_range}
            label="Outside range"
            variant="amber"
          />
          {summary.critical_flags > 0 ? (
            <SummaryTile
              count={summary.critical_flags}
              label="Critical flags"
              variant="critical"
            />
          ) : null}
        </div>
      ) : null}

      {/* Educational disclaimer */}
      <div className="results-disclaimer">
        <Info size={12} aria-hidden="true" />
        <span>
          Results are compared to your laboratory&apos;s own reference intervals.
          This is for educational purposes only — it is not a medical diagnosis,
          treatment recommendation or health score.
        </span>
      </div>

      {/* Results sections */}
      <div className="results-sections">
        {outsideRange.length > 0 ? (
          <AssessmentSection
            title="Outside laboratory range"
            assessments={outsideRange}
            explanations={expMeasurements}
            criticalIds={criticalIds}
            defaultOpen={true}
          />
        ) : null}
        {needsReview.length > 0 ? (
          <AssessmentSection
            title="Needs review"
            assessments={needsReview}
            explanations={expMeasurements}
            criticalIds={criticalIds}
            defaultOpen={outsideRange.length === 0}
          />
        ) : null}
        {withinRange.length > 0 ? (
          <AssessmentSection
            title="Within laboratory range"
            assessments={withinRange}
            explanations={expMeasurements}
            criticalIds={criticalIds}
            defaultOpen={outsideRange.length === 0 && needsReview.length === 0}
          />
        ) : null}

        {analysis.assessments.length === 0 ? (
          <div className="results-empty">
            <CheckCircle2 size={24} strokeWidth={1.5} aria-hidden="true" />
            <p>No assessments were returned by the analysis engine.</p>
            <ButtonLink to={`/app/reports/${reportId}`} variant="secondary" size="sm">
              Open report workspace
            </ButtonLink>
          </div>
        ) : null}
      </div>

      {/* Clinician handoff (Phase 6 reuse) */}
      <ClinicianSummarySection
        report={currentReport}
        measurements={measurements}
        analysis={analysis}
        explanations={explanations}
      />
      <FindCareSection />

      {/* Footer disclaimer */}
      <div className="results-footer-note">
        <ShieldCheck size={13} aria-hidden="true" />
        <span>
          LabLens is an educational tool. It does not provide medical advice,
          diagnose conditions or recommend treatments. Always consult a qualified
          healthcare professional with your results.
        </span>
      </div>
    </PageContainer>
  )
}
