import { useState } from 'react'
import {
  FileText,
  Info,
  Printer,
  ShieldAlert,
  SlidersHorizontal,
  CheckSquare,
  Square,
  MessageSquare,
} from 'lucide-react'
import { Button } from './Button'
import { StatusBadge, type StatusVariant } from './StatusBadge'
import type {
  ApiReport,
  Measurement,
  AnalysisResult,
  ExplanationsResult,
} from '../lib/api'

interface ClinicianSummaryProps {
  report: ApiReport | null
  measurements: Measurement[]
  analysis: AnalysisResult | null
  explanations: ExplanationsResult | null
}

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

export function ClinicianSummarySection({
  report,
  measurements,
  analysis,
  explanations,
}: ClinicianSummaryProps) {
  // Inclusion controls (Preferences are purely local state, never sent to server)
  const [includeExplanations, setIncludeExplanations] = useState(true)
  const [includeQuestions, setIncludeQuestions] = useState(true)
  const [includePatterns, setIncludePatterns] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(true)
  const [personalNotes, setPersonalNotes] = useState('')

  const handlePrint = () => {
    window.print()
  }

  // Summary generation metadata
  const generationDate = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })

  const isStale = analysis?.freshness === 'stale'

  const hasCritical = measurements.some(
    (m) =>
      m.lab_flag &&
      (m.lab_flag.toLowerCase().includes('crit') || m.lab_flag.toLowerCase().includes('panic')),
  ) || (!isStale && analysis?.critical_flags && analysis.critical_flags.length > 0)

  return (
    <section className="handoff-section" aria-labelledby="handoff-title">
      <div className="handoff-header no-print">
        <div>
          <div className="handoff-title-group">
            <FileText size={20} className="handoff-icon" aria-hidden="true" />
            <h2 id="handoff-title" className="handoff-title">
              Prepare for your appointment
            </h2>
          </div>
          <p className="handoff-subtitle">
            Take a clear, structured summary of your laboratory report into your next conversation with a healthcare professional.
          </p>
        </div>
        <div className="handoff-actions">
          <Button variant="primary" size="md" onClick={handlePrint} className="print-trigger-btn">
            <Printer size={16} aria-hidden="true" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Configuration Controls (Interactive only, hidden from print output) */}
      <div className="card handoff-controls-card no-print">
        <h3 className="handoff-controls-title">
          <SlidersHorizontal size={15} aria-hidden="true" />
          Summary customization
        </h3>
        <p className="handoff-controls-desc">
          Choose what details to include in your exported summary. Critical flags and original laboratory values are always preserved.
        </p>

        <div className="handoff-toggles">
          <label className="handoff-checkbox-label">
            <input
              type="checkbox"
              checked={includePatterns}
              onChange={(e) => setIncludePatterns(e.target.checked)}
              className="handoff-checkbox-input"
            />
            <span className="handoff-checkbox-custom">
              {includePatterns ? <CheckSquare size={16} /> : <Square size={16} />}
            </span>
            <span>Include supported pattern findings</span>
          </label>

          <label className="handoff-checkbox-label">
            <input
              type="checkbox"
              checked={includeExplanations}
              onChange={(e) => setIncludeExplanations(e.target.checked)}
              className="handoff-checkbox-input"
            />
            <span className="handoff-checkbox-custom">
              {includeExplanations ? <CheckSquare size={16} /> : <Square size={16} />}
            </span>
            <span>Include plain-language measurement context</span>
          </label>

          <label className="handoff-checkbox-label">
            <input
              type="checkbox"
              checked={includeQuestions}
              onChange={(e) => setIncludeQuestions(e.target.checked)}
              className="handoff-checkbox-input"
            />
            <span className="handoff-checkbox-custom">
              {includeQuestions ? <CheckSquare size={16} /> : <Square size={16} />}
            </span>
            <span>Include questions to discuss with doctor</span>
          </label>

          <label className="handoff-checkbox-label">
            <input
              type="checkbox"
              checked={includeNotes}
              onChange={(e) => setIncludeNotes(e.target.checked)}
              className="handoff-checkbox-input"
            />
            <span className="handoff-checkbox-custom">
              {includeNotes ? <CheckSquare size={16} /> : <Square size={16} />}
            </span>
            <span>Include personal discussion notes</span>
          </label>
        </div>

        {includeNotes && (
          <div className="handoff-notes-group">
            <label htmlFor="clinician-notes-input" className="handoff-notes-label">
              <MessageSquare size={14} aria-hidden="true" />
              Optional personal notes for your clinician (private & stored locally in this session only)
            </label>
            <textarea
              id="clinician-notes-input"
              rows={3}
              className="handoff-notes-textarea"
              placeholder="e.g. Current symptoms experienced, medication updates, questions on fatigue or diet to discuss..."
              value={personalNotes}
              onChange={(e) => setPersonalNotes(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ─── PRINTABLE DOCUMENT CONTAINER ─── */}
      <div className="clinician-doc" id="clinician-summary-doc">
        {/* Document Header */}
        <header className="doc-header">
          <div className="doc-header__brand">
            <span className="doc-header__logo">LabLens</span>
            <span className="doc-header__tagline">Educational Laboratory Report Summary</span>
          </div>
          <div className="doc-header__meta">
            <div><strong>Document:</strong> {report?.original_filename ?? 'Laboratory Report'}</div>
            {report?.created_at && (
              <div><strong>Uploaded:</strong> {new Date(report.created_at).toLocaleDateString()}</div>
            )}
            <div><strong>Summary Date:</strong> {generationDate}</div>
            {isStale && (
              <div><strong>Analysis status:</strong> Outdated — refresh required</div>
            )}
          </div>
        </header>

        {/* Patient Notice / Safety Disclaimer */}
        <div className="doc-disclaimer-box">
          <p>
            <strong>Notice for Healthcare Professionals & Patients:</strong> This document is a patient-prepared summary compiled using LabLens for educational discussion. It is not an automated medical diagnosis, clinical opinion, or triage directive. All measurements, units, and ranges are transcribed from the issuing laboratory report.
          </p>
        </div>

        {/* Stale Analysis Notice */}
        {isStale && (
          <div className="doc-stale-box" role="alert">
            <Info size={18} strokeWidth={2.2} aria-hidden="true" />
            <div>
              <strong>ANALYSIS OUTDATED</strong>
              <p>
                Measurements changed after this analysis was generated. Comparison
                statuses, pattern findings and explanations from the previous analysis
                have been withheld because they are no longer current. Re-verify the
                corrected measurements and run analysis again before relying on this
                summary for discussion.
              </p>
            </div>
          </div>
        )}

        {/* Critical Laboratory Flags Banner (Unsuppressed) */}
        {hasCritical && (
          <div className="doc-critical-box" role="alert">
            <ShieldAlert size={18} strokeWidth={2.2} aria-hidden="true" />
            <div>
              <strong>CRITICAL LABORATORY ALERT ON RECORD</strong>
              <p>
                One or more measurements carry a critical, panic, or abnormal warning flag from the testing laboratory. Please follow the laboratory's printed instructions and consult a clinician promptly.
              </p>
            </div>
          </div>
        )}

        {/* Section 1: Overview Counts */}
        <section className="doc-section">
          <h3 className="doc-section__title">1. Report Overview</h3>
          <div className="doc-overview-grid">
            <div className="doc-overview-cell">
              <span className="doc-overview-val">{measurements.length}</span>
              <span className="doc-overview-lbl">Total measurements</span>
            </div>
            {analysis?.summary && !isStale && (
              <>
                <div className="doc-overview-cell">
                  <span className="doc-overview-val">{analysis.summary.within_range}</span>
                  <span className="doc-overview-lbl">Within printed range</span>
                </div>
                <div className="doc-overview-cell">
                  <span className="doc-overview-val">
                    {analysis.summary.above_range + analysis.summary.below_range}
                  </span>
                  <span className="doc-overview-lbl">Outside printed range</span>
                </div>
                <div className="doc-overview-cell">
                  <span className="doc-overview-val">{analysis.summary.findings_count}</span>
                  <span className="doc-overview-lbl">Supported patterns</span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Section 2: Complete Measurements Table */}
        <section className="doc-section">
          <h3 className="doc-section__title">2. Laboratory Measurements</h3>
          <div className="doc-table-wrap">
            <table className="doc-table">
              <thead>
                <tr>
                  <th scope="col">Test Name</th>
                  <th scope="col">Result</th>
                  <th scope="col">Unit</th>
                  <th scope="col">Laboratory Reference Range</th>
                  <th scope="col">Comparison Status</th>
                  <th scope="col">Review Status</th>
                </tr>
              </thead>
              <tbody>
                {measurements.map((m) => {
                  const assessment = analysis?.assessments.find((a) => a.measurement_id === m.id)
                  const isCrit =
                    m.lab_flag &&
                    (m.lab_flag.toLowerCase().includes('crit') ||
                      m.lab_flag.toLowerCase().includes('panic'))
                  return (
                    <tr key={m.id} className={isCrit ? 'is-critical-row' : ''}>
                      <td>
                        <strong>{m.test_name_normalized}</strong>
                        {m.test_name_original !== m.test_name_normalized && (
                          <div className="doc-subtext">Original: {m.test_name_original}</div>
                        )}
                      </td>
                      <td className="doc-tabular">
                        <strong>{m.result_original}</strong>
                      </td>
                      <td>{m.unit_original ?? '—'}</td>
                      <td className="doc-tabular">{m.reference_range_original ?? '—'}</td>
                      <td>
                        {isStale ? (
                          <span className="doc-subtext">Not current — re-run analysis</span>
                        ) : assessment ? (
                          <StatusBadge
                            variant={isCrit ? 'critical' : statusVariant(assessment.comparison_status)}
                            dot={false}
                          >
                            {assessment.comparison_status.replace(/_/g, ' ')}
                          </StatusBadge>
                        ) : (
                          <span className="doc-subtext">{m.derived_flag ?? 'Not compared'}</span>
                        )}
                        {m.lab_flag && (
                          <span className="doc-lab-flag">Flag: {m.lab_flag}</span>
                        )}
                      </td>
                      <td>
                        <span className={`doc-verif ${m.verification_status === 'verified' ? 'is-verified' : 'is-review'}`}>
                          {m.verification_status === 'verified' ? 'Verified' : 'Needs review'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 3: Supported Patterns */}
        {!isStale && includePatterns && analysis?.findings && analysis.findings.length > 0 && (
          <section className="doc-section">
            <h3 className="doc-section__title">3. Supported Measurement Patterns</h3>
            <div className="doc-patterns-list">
              {analysis.findings.map((f) => (
                <div key={f.id} className="doc-pattern-block">
                  <div className="doc-pattern-header">
                    <strong>{f.finding_code}</strong>
                    <span className="doc-subtext">{f.metadata?.reference ?? 'Guidance reference'}</span>
                  </div>
                  <p className="doc-pattern-desc">{f.metadata?.description}</p>
                  {f.metadata?.patient_context_needed && f.metadata.patient_context_needed.length > 0 && (
                    <div className="doc-subtext doc-mt-xs">
                      <strong>Relevant context for clinician:</strong>{' '}
                      {f.metadata.patient_context_needed.join(', ')}
                    </div>
                  )}
                  {f.metadata?.limitations && (
                    <div className="doc-subtext doc-mt-xs doc-limitation">
                      {f.metadata.limitations.join(' ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 4: Plain-Language Explanations */}
        {!isStale && includeExplanations && explanations && explanations.measurements.length > 0 && (
          <section className="doc-section">
            <h3 className="doc-section__title">4. Educational Test Explanations</h3>
            <div className="doc-exps-grid">
              {explanations.measurements.map((em) => (
                <div key={em.measurement_id} className="doc-exp-card">
                  <div className="doc-exp-card__name">
                    <strong>{em.test_name}</strong>
                    <span className="doc-subtext">
                      {em.value} {em.unit ?? ''}
                    </span>
                  </div>
                  <p className="doc-exp-card__text">{em.what_it_measures}</p>
                  {em.possible_influences && em.possible_influences.length > 0 && (
                    <div className="doc-subtext doc-mt-xs">
                      <strong>Possible influencing factors:</strong>{' '}
                      {em.possible_influences.slice(0, 4).join(', ')}
                    </div>
                  )}
                  <div className="doc-subtext doc-mt-xs doc-limitation">
                    <strong>Limitation:</strong> {em.cannot_establish}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Section 5: Clinician Discussion Questions */}
        {!isStale && includeQuestions && explanations && (
          <section className="doc-section">
            <h3 className="doc-section__title">5. Discussion Questions for Healthcare Professional</h3>
            <ul className="doc-questions-list">
              {Array.from(
                new Set(explanations.measurements.flatMap((m) => m.discussion_questions)),
              ).slice(0, 8).map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Section 6: User Personal Notes */}
        {includeNotes && personalNotes.trim() && (
          <section className="doc-section doc-notes-section">
            <h3 className="doc-section__title">6. Patient Discussion Notes & Topics</h3>
            <div className="doc-notes-content">
              {personalNotes.split('\n').map((line, idx) => (
                <p key={idx}>{line}</p>
              ))}
            </div>
          </section>
        )}

        {/* Document Footer */}
        <footer className="doc-footer">
          <div>
            LabLens Summary • Generated on {generationDate} • Versioned Catalogue {explanations?.catalogue_version ?? '2.0'}
          </div>
          <div>
            Educational summary only • Not a diagnostic or treatment document • Verify with original laboratory report
          </div>
        </footer>
      </div>
    </section>
  )
}
