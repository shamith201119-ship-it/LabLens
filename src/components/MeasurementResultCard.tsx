import { useState } from 'react'
import { ChevronDown, ChevronUp, TriangleAlert } from 'lucide-react'
import { StatusBadge, type StatusVariant } from './StatusBadge'
import type { AnalysisAssessment, MeasurementExplanation } from '../lib/api'

function comparisonVariant(status: string): StatusVariant {
  switch (status) {
    case 'within_range':
      return 'lime'
    case 'above_range':
    case 'below_range':
      return 'amber'
    case 'review_required':
    case 'incompatible_units':
      return 'neutral'
    default:
      return 'neutral'
  }
}

function comparisonLabel(status: string): string {
  switch (status) {
    case 'within_range':
      return 'Within range'
    case 'above_range':
      return 'Above range'
    case 'below_range':
      return 'Below range'
    case 'review_required':
      return 'Needs review'
    case 'incompatible_units':
      return 'Units differ'
    case 'qualitative':
      return 'Qualitative'
    default:
      return status.replace(/_/g, ' ')
  }
}

interface MeasurementResultCardProps {
  assessment: AnalysisAssessment
  explanation?: MeasurementExplanation
  isCritical?: boolean
}

export function MeasurementResultCard({
  assessment,
  explanation,
  isCritical = false,
}: MeasurementResultCardProps) {
  const [expanded, setExpanded] = useState(false)
  const variant = isCritical ? 'critical' : comparisonVariant(assessment.comparison_status)

  return (
    <article
      className={`mrc-card mrc-card--${variant}${isCritical ? ' mrc-card--critical' : ''}`}
      aria-label={assessment.test_name}
    >
      {isCritical ? (
        <div className="mrc-critical-banner" role="alert">
          <TriangleAlert size={13} strokeWidth={2} aria-hidden="true" />
          <span>Critical laboratory flag — please contact your healthcare professional</span>
        </div>
      ) : null}

      <div className="mrc-main">
        <div className="mrc-identity">
          <h3 className="mrc-name">{assessment.test_name}</h3>
          {assessment.source_page != null ? (
            <span className="mrc-page">p.{assessment.source_page}</span>
          ) : null}
        </div>

        <div className="mrc-value-block">
          <span className="mrc-value">
            {assessment.value ?? '—'}
            {assessment.unit ? (
              <span className="mrc-unit"> {assessment.unit}</span>
            ) : null}
          </span>
          {assessment.range ? (
            <span className="mrc-range">ref {assessment.range}</span>
          ) : null}
        </div>

        <div className="mrc-status">
          <StatusBadge variant={variant} dot={false}>
            {comparisonLabel(assessment.comparison_status)}
          </StatusBadge>
        </div>
      </div>

      {explanation ? (
        <>
          {!expanded ? (
            <p className="mrc-snippet">{explanation.result_description}</p>
          ) : null}

          <button
            type="button"
            className="mrc-expand-btn"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
          >
            <span>{expanded ? 'Hide explanation' : 'Understand this result'}</span>
            {expanded ? (
              <ChevronUp size={13} aria-hidden="true" />
            ) : (
              <ChevronDown size={13} aria-hidden="true" />
            )}
          </button>

          {expanded ? (
            <div className="mrc-explanation">
              <div className="mrc-exp-section">
                <h4>What it measures</h4>
                <p>{explanation.what_it_measures}</p>
              </div>
              <div className="mrc-exp-section">
                <h4>Your result</h4>
                <p>{explanation.result_description}</p>
              </div>
              {explanation.why_doctors_look_at_it ? (
                <div className="mrc-exp-section">
                  <h4>Why clinicians look at this</h4>
                  <p>{explanation.why_doctors_look_at_it}</p>
                </div>
              ) : null}
              {explanation.possible_influences.length > 0 ? (
                <div className="mrc-exp-section">
                  <h4>Factors that can influence this result</h4>
                  <ul>
                    {explanation.possible_influences.map((inf, i) => (
                      <li key={i}>{inf}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {explanation.cannot_establish ? (
                <div className="mrc-exp-section mrc-exp-section--caveat">
                  <h4>What this cannot tell you</h4>
                  <p>{explanation.cannot_establish}</p>
                </div>
              ) : null}
              {explanation.discussion_questions.length > 0 ? (
                <div className="mrc-exp-section mrc-exp-section--questions">
                  <h4>Questions to ask your clinician</h4>
                  <ul>
                    {explanation.discussion_questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {explanation.sources.length > 0 ? (
                <div className="mrc-exp-sources">
                  {explanation.sources.map((s) => (
                    <a
                      key={s.id}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mrc-source-link"
                    >
                      {s.publisher} — {s.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <p className="mrc-snippet mrc-snippet--no-exp">
          {assessment.limitations || 'No detailed explanation available for this result.'}
        </p>
      )}
    </article>
  )
}
