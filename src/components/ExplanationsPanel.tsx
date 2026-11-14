/**
 * Phase 5 — ExplanationsPanel
 * "Your report, explained."
 *
 * Renders the full explanation experience for a report's Phase 4 analysis:
 * — Summary counts
 * — Per-measurement educational cards with expand/collapse
 * — Pattern finding explanations
 * — Medical sources
 * — All required states: loading, error, empty, not-started, critical-flag
 *
 * Safety rules enforced:
 * — Unverified measurements show no personal numerical interpretation
 * — Critical lab flags are always visible and prominently displayed
 * — No health scores, no diagnoses, no treatment recommendations
 */
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileQuestion,
  FlaskConical,
  Info,
  Layers,
  MessageCircleQuestion,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react'
import { cx } from '../lib/cx'
import { StatusBadge, type StatusVariant } from './StatusBadge'
import {
  getExplanations,
  type ExplanationsResult,
  type MeasurementExplanation,
  type PatternExplanation,
} from '../lib/api'

// ─── Helpers ───────────────────────────────────────────────────────────────

function statusVariant(status: string): StatusVariant {
  switch (status) {
    case 'within_range':
      return 'lime'
    case 'above_range':
    case 'below_range':
      return 'amber'
    case 'incompatible_units':
    case 'review_required':
    case 'unavailable':
      return 'outline'
    default:
      return 'neutral'
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

// ─── Measurement card ──────────────────────────────────────────────────────

function MeasurementCard({ m }: { m: MeasurementExplanation }) {
  const [open, setOpen] = useState(false)
  const isCritical = m.is_critical
  const isUnverified = m.is_unverified

  return (
    <article
      className={cx(
        'exp-card',
        isCritical && 'exp-card--critical',
        isUnverified && 'exp-card--unverified',
      )}
      aria-label={`Explanation for ${m.test_name}`}
    >
      {/* Critical flag banner — always visible, never suppressed */}
      {isCritical && (
        <div className="exp-critical-banner" role="alert">
          <ShieldAlert size={15} strokeWidth={2} aria-hidden="true" />
          <span>
            <strong>Critical laboratory flag: {m.lab_flag}</strong> — Please contact your
            healthcare professional or the issuing laboratory promptly.
          </span>
        </div>
      )}

      {/* Card header — always visible */}
      <button
        type="button"
        className="exp-card__header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="exp-card__at-a-glance">
          <div className="exp-card__name-row">
            <span className="exp-card__name">{m.test_name}</span>
            {isUnverified && (
              <StatusBadge variant="outline" dot={false} className="exp-badge--sm">
                Needs review
              </StatusBadge>
            )}
            {isCritical && !isUnverified && (
              <StatusBadge variant="critical" dot={false} className="exp-badge--sm">
                Critical flag
              </StatusBadge>
            )}
          </div>

          <div className="exp-card__values">
            <span className="exp-card__value">
              {m.value ?? '—'}{m.unit ? ` ${m.unit}` : ''}
            </span>
            {m.reference_range && (
              <span className="exp-card__ref">
                ref {m.reference_range}
              </span>
            )}
            {!isUnverified && (
              <StatusBadge
                variant={isCritical ? 'critical' : statusVariant(m.comparison_status)}
                dot={false}
                className="exp-badge--sm"
              >
                {statusLabel(m.comparison_status)}
              </StatusBadge>
            )}
          </div>
        </div>

        <span className="exp-card__chevron" aria-hidden="true">
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {/* Expandable detail */}
      {open && (
        <div className="exp-card__body">
          {/* Result description */}
          <div className="exp-section">
            <p className="exp-result-desc">{m.result_description}</p>
          </div>

          {/* What it measures */}
          <div className="exp-section">
            <h4 className="exp-section__title">
              <FlaskConical size={13} aria-hidden="true" />
              Understand this test
            </h4>
            <p>{m.what_it_measures}</p>
            <p className="exp-muted">{m.why_doctors_look_at_it}</p>
          </div>

          {/* Possible influences */}
          {!isUnverified && m.possible_influences.length > 0 && (
            <div className="exp-section">
              <h4 className="exp-section__title">
                <Layers size={13} aria-hidden="true" />
                Factors that may influence this measurement
              </h4>
              <ul className="exp-list">
                {m.possible_influences.map((inf, i) => (
                  <li key={i}>{inf}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Context */}
          {m.context_factors.length > 0 && (
            <div className="exp-section">
              <h4 className="exp-section__title">
                <Info size={13} aria-hidden="true" />
                Relevant context
              </h4>
              <ul className="exp-list exp-list--inline">
                {m.context_factors.map((cf, i) => (
                  <li key={i}>
                    <span className="exp-tag">{cf}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Cannot establish */}
          <div className="exp-section exp-section--limitation">
            <h4 className="exp-section__title">
              <Info size={13} aria-hidden="true" />
              What this result cannot establish
            </h4>
            <p className="exp-muted">{m.cannot_establish}</p>
          </div>

          {/* Discussion questions */}
          {m.discussion_questions.length > 0 && (
            <div className="exp-section">
              <h4 className="exp-section__title">
                <MessageCircleQuestion size={13} aria-hidden="true" />
                Questions to discuss with your doctor
              </h4>
              <ul className="exp-list exp-list--questions">
                {m.discussion_questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Sources */}
          {m.sources.length > 0 && (
            <div className="exp-section exp-section--sources">
              <h4 className="exp-section__title">
                <BookOpen size={13} aria-hidden="true" />
                Medical sources
              </h4>
              <ul className="exp-sources">
                {m.sources.map((s) => (
                  <li key={s.id}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="exp-source-link"
                    >
                      <span className="exp-source-link__title">{s.title}</span>
                      <span className="exp-source-link__pub">{s.publisher}</span>
                      <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// ─── Pattern card ──────────────────────────────────────────────────────────

function PatternCard({ p }: { p: PatternExplanation }) {
  const [open, setOpen] = useState(false)

  return (
    <article className="exp-pattern-card" aria-label={`Pattern: ${p.plain_title}`}>
      <button
        type="button"
        className="exp-card__header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="exp-card__at-a-glance">
          <span className="exp-card__name">{p.plain_title}</span>
          {!p.has_catalogue_entry && (
            <StatusBadge variant="outline" dot={false} className="exp-badge--sm">
              No educational note available
            </StatusBadge>
          )}
        </div>
        <span className="exp-card__chevron" aria-hidden="true">
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {open && (
        <div className="exp-card__body">
          {/* Plain description */}
          <div className="exp-section">
            <p>{p.plain_description}</p>
          </div>

          {/* Measurements involved */}
          {p.measurements.length > 0 && (
            <div className="exp-section">
              <h4 className="exp-section__title">
                <FlaskConical size={13} aria-hidden="true" />
                Measurements in this finding
              </h4>
              <ul className="exp-pattern-measures">
                {p.measurements.map((pm, i) => (
                  <li key={i} className="exp-pattern-measure">
                    <span className="exp-pattern-measure__name">{pm.test_name}</span>
                    <span className="exp-pattern-measure__value">
                      {pm.value ?? '—'}{pm.unit ? ` ${pm.unit}` : ''}
                      {pm.range ? ` · ref ${pm.range}` : ''}
                    </span>
                    <StatusBadge
                      variant={statusVariant(pm.comparison_status)}
                      dot={false}
                      className="exp-badge--sm"
                    >
                      {statusLabel(pm.comparison_status)}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Why grouped */}
          {p.why_grouped && (
            <div className="exp-section">
              <h4 className="exp-section__title">
                <Info size={13} aria-hidden="true" />
                Why these measurements are shown together
              </h4>
              <p className="exp-muted">{p.why_grouped}</p>
            </div>
          )}

          {/* What to discuss */}
          {p.what_to_discuss && (
            <div className="exp-section">
              <h4 className="exp-section__title">
                <MessageCircleQuestion size={13} aria-hidden="true" />
                What to discuss with a clinician
              </h4>
              <p>{p.what_to_discuss}</p>
            </div>
          )}

          {/* Patient context needed */}
          {p.patient_context_needed.length > 0 && (
            <div className="exp-section">
              <h4 className="exp-section__title">
                <Layers size={13} aria-hidden="true" />
                Useful context for your clinician
              </h4>
              <ul className="exp-list exp-list--inline">
                {p.patient_context_needed.map((c, i) => (
                  <li key={i}>
                    <span className="exp-tag">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Limitations */}
          {p.limitations.length > 0 && (
            <div className="exp-section exp-section--limitation">
              <h4 className="exp-section__title">
                <Info size={13} aria-hidden="true" />
                Limitations
              </h4>
              <ul className="exp-list">
                {p.limitations.map((lim, i) => (
                  <li key={i} className="exp-muted">{lim}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Sources */}
          {p.sources.length > 0 && (
            <div className="exp-section exp-section--sources">
              <h4 className="exp-section__title">
                <BookOpen size={13} aria-hidden="true" />
                Medical sources
              </h4>
              <ul className="exp-sources">
                {p.sources.map((s) => (
                  <li key={s.id}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="exp-source-link"
                    >
                      <span className="exp-source-link__title">{s.title}</span>
                      <span className="exp-source-link__pub">{s.publisher}</span>
                      <ExternalLink size={11} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </article>
  )
}

// ─── Summary bar ───────────────────────────────────────────────────────────

function SummaryBar({ data }: { data: ExplanationsResult }) {
  const s = data.summary
  const items = [
    { label: 'Within range', value: s.within_range, variant: 'lime' as StatusVariant },
    { label: 'Above range', value: s.above_range, variant: 'amber' as StatusVariant },
    { label: 'Below range', value: s.below_range, variant: 'amber' as StatusVariant },
    { label: 'Needs review', value: s.unverified_or_needs_review, variant: 'outline' as StatusVariant },
    { label: 'Patterns', value: s.supported_patterns, variant: 'mint' as StatusVariant },
  ].filter((item) => item.value > 0)

  return (
    <div className="exp-summary" role="region" aria-label="Report summary">
      {items.map((item) => (
        <div key={item.label} className="exp-summary__item">
          <span className="exp-summary__count">{item.value}</span>
          <StatusBadge variant={item.variant} dot={false}>
            {item.label}
          </StatusBadge>
        </div>
      ))}
    </div>
  )
}

// ─── States ────────────────────────────────────────────────────────────────

function ExpLoading() {
  return (
    <div className="exp-state" aria-live="polite" aria-busy="true">
      <span className="exp-state__icon" aria-hidden="true">
        <RefreshCw size={20} strokeWidth={1.6} className="exp-spin" />
      </span>
      <p>Loading explanations…</p>
    </div>
  )
}

function ExpError({ message }: { message: string }) {
  return (
    <div className="exp-state exp-state--error" role="alert">
      <span className="exp-state__icon" aria-hidden="true">
        <AlertTriangle size={20} strokeWidth={1.6} />
      </span>
      <p>{message}</p>
    </div>
  )
}

function ExpNotStarted() {
  return (
    <div className="exp-state" role="status">
      <span className="exp-state__icon" aria-hidden="true">
        <FileQuestion size={20} strokeWidth={1.6} />
      </span>
      <p>
        Run <strong>Analyse health patterns</strong> above to generate explanations for your
        measurements.
      </p>
    </div>
  )
}

function ExpStale() {
  return (
    <div className="exp-state" role="status">
      <span className="exp-state__icon" aria-hidden="true">
        <AlertTriangle size={20} strokeWidth={1.6} />
      </span>
      <p>
        Measurements changed after this analysis was generated, so these explanations are no
        longer current. Re-verify the corrected measurements and run{' '}
        <strong>Analyse health patterns</strong> again to refresh them.
      </p>
    </div>
  )
}

function ExpEmpty() {
  return (
    <div className="exp-state" role="status">
      <span className="exp-state__icon" aria-hidden="true">
        <FileQuestion size={20} strokeWidth={1.6} />
      </span>
      <p>
        No explanations are available. This may be because no measurements in this report match
        the supported catalogue of biomarkers.
      </p>
    </div>
  )
}

// ─── Main exported panel ───────────────────────────────────────────────────

interface ExplanationsPanelProps {
  reportId: string
  /** Pass the current analysis to know when to refresh explanations */
  analysisCompleted: boolean
}

export function ExplanationsPanel({ reportId, analysisCompleted }: ExplanationsPanelProps) {
  const [data, setData] = useState<ExplanationsResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!reportId) return
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await getExplanations(reportId)
        if (!cancelled) setData(result)
      } catch (e: unknown) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : 'Failed to load explanations')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [reportId, analysisCompleted])

  return (
    <section className="exp-panel" aria-labelledby="exp-panel-title">
      {/* Panel header */}
      <div className="exp-panel__head">
        <h2 id="exp-panel-title" className="exp-panel__title">
          Your report, explained
        </h2>
        <p className="exp-panel__sub">
          Understand what your measurements show, what may influence them, and what to discuss
          next.
        </p>
      </div>

      {/* Content */}
      {loading && <ExpLoading />}
      {!loading && error && <ExpError message={error} />}
      {!loading && !error && data?.analysis_status === 'not_started' && <ExpNotStarted />}
      {!loading && !error && data?.analysis_status === 'stale' && <ExpStale />}
      {!loading && !error && data?.analysis_status === 'completed' && (
        <>
          {/* Summary counts */}
          {data.summary.total_assessments > 0 && <SummaryBar data={data} />}

          {/* Critical flags — always first */}
          {data.measurements.some((m) => m.is_critical) && (
            <div className="exp-critical-section" role="alert">
              <ShieldAlert size={16} strokeWidth={2} aria-hidden="true" />
              <div>
                <strong>Critical laboratory flag on this report.</strong>
                <p>
                  One or more measurements carry a critical or panic flag from the laboratory.
                  Please contact your healthcare professional or the issuing laboratory promptly.
                </p>
              </div>
            </div>
          )}

          {/* Measurement explanations */}
          {data.measurements.length > 0 ? (
            <div className="exp-cards" role="list" aria-label="Measurement explanations">
              {data.measurements.map((m) => (
                <div role="listitem" key={m.measurement_id}>
                  <MeasurementCard m={m} />
                </div>
              ))}
            </div>
          ) : (
            <ExpEmpty />
          )}

          {/* Pattern explanations */}
          {data.patterns.length > 0 && (
            <div className="exp-patterns-section">
              <h3 className="exp-patterns-section__title">
                Measurement relationships detected
              </h3>
              <p className="exp-muted exp-patterns-section__sub">
                The analysis engine identified the following measurement patterns. These are
                educational observations — not diagnoses.
              </p>
              <div className="exp-cards" role="list" aria-label="Pattern explanations">
                {data.patterns.map((p) => (
                  <div role="listitem" key={p.finding_id}>
                    <PatternCard p={p} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disclaimer */}
          <p className="exp-disclaimer">
            <Info size={11} aria-hidden="true" />
            <span>{data.disclaimer}</span>
          </p>
        </>
      )}
    </section>
  )
}
