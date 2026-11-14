import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpDown,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  FileText,
  History,
  Info,
  RefreshCw,
  Search,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Button, ButtonLink } from '../components/Button'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import { TrendChart } from '../components/TrendChart'
import type {
  BiomarkerHistoryResult,
  BiomarkerSummaryItem,
  ComparisonResult,
  HistoryOverviewResult,
} from '../lib/api'
import {
  compareHistoryReports,
  getBiomarkerHistory,
  getHistoryOverview,
} from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'

export function HistoryPage() {
  usePageTitle('Lab History & Trends — LabLens')
  const [searchParams, setSearchParams] = useSearchParams()

  // Tab management: 'timeline' | 'compare' | 'trends'
  const activeTab = (searchParams.get('tab') as 'timeline' | 'compare' | 'trends') || 'timeline'
  const setTab = (tab: 'timeline' | 'compare' | 'trends') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    })
  }

  // Data states
  const [overview, setOverview] = useState<HistoryOverviewResult | null>(null)
  const [loadingOverview, setLoadingOverview] = useState(true)
  const [overviewError, setOverviewError] = useState<string | null>(null)

  // Timeline filtering & sorting
  const [timelineQuery, setTimelineQuery] = useState('')
  const [timelineSortAsc, setTimelineSortAsc] = useState(false) // default newest first

  // Comparison states
  const [reportAId, setReportAId] = useState<string>(searchParams.get('reportA') || '')
  const [reportBId, setReportBId] = useState<string>(searchParams.get('reportB') || '')
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null)
  const [comparing, setComparing] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)

  // Biomarker trends states
  const [biomarkerCategory, setBiomarkerCategory] = useState<string>('all')
  const [biomarkerQuery, setBiomarkerQuery] = useState('')
  const [biomarkerHistory, setBiomarkerHistory] = useState<BiomarkerHistoryResult | null>(null)
  const [loadingBiomarker, setLoadingBiomarker] = useState(false)
  const [biomarkerError, setBiomarkerError] = useState<string | null>(null)

  // Selected biomarker is derived from URL param or first available biomarker
  const selectedBiomarker =
    searchParams.get('biomarker') ||
    (overview?.available_biomarkers.length ? overview.available_biomarkers[0].test_name : '')

  // Load history overview
  const loadOverview = async () => {
    setOverviewError(null)
    setLoadingOverview(true)
    try {
      const data = await getHistoryOverview()
      setOverview(data)

      // Set initial comparison reports if not set
      if (!reportAId && data.timeline.length >= 2) {
        setReportAId(data.timeline[1].report_id) // earlier
      }
      if (!reportBId && data.timeline.length >= 1) {
        setReportBId(data.timeline[0].report_id) // latest
      }
    } catch (err) {
      setOverviewError(err instanceof Error ? err.message : 'Failed to load history overview')
    } finally {
      setLoadingOverview(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadOverview()
    }, 0)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load selected biomarker history
  useEffect(() => {
    if (!selectedBiomarker) {
      return
    }

    let isMounted = true
    const timer = window.setTimeout(() => {
      setLoadingBiomarker(true)
      setBiomarkerError(null)

      getBiomarkerHistory(selectedBiomarker)
        .then((res) => {
          if (isMounted) setBiomarkerHistory(res)
        })
        .catch((err) => {
          if (isMounted) setBiomarkerError(err instanceof Error ? err.message : 'Failed to load biomarker data')
        })
        .finally(() => {
          if (isMounted) setLoadingBiomarker(false)
        })
    }, 0)

    return () => {
      isMounted = false
      window.clearTimeout(timer)
    }
  }, [selectedBiomarker])

  // Perform comparison
  const handleRunComparison = async (idA = reportAId, idB = reportBId) => {
    if (!idA || !idB) {
      setCompareError('Please select two reports to compare.')
      return
    }
    if (idA === idB) {
      setCompareError('Please select two distinct reports to compare.')
      return
    }

    setComparing(true)
    setCompareError(null)
    try {
      const res = await compareHistoryReports([idA, idB])
      setComparisonResult(res)
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Comparison failed')
    } finally {
      setComparing(false)
    }
  }

  // Swap Report A and Report B
  const handleSwapReports = () => {
    const temp = reportAId
    setReportAId(reportBId)
    setReportBId(temp)
    if (comparisonResult) {
      void handleRunComparison(reportBId, temp)
    }
  }

  // Action: Launch comparison from timeline
  const handleCompareFromTimeline = (reportId: string) => {
    setReportAId(reportId)
    // Find another report if available
    const other = overview?.timeline.find((r) => r.report_id !== reportId)
    if (other) {
      setReportBId(other.report_id)
    }
    setTab('compare')
  }

  // Action: Navigate to trends for specific biomarker
  const handleViewBiomarkerTrends = (biomarkerName: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', 'trends')
      next.set('biomarker', biomarkerName)
      return next
    })
  }

  // Filtered & sorted timeline entries
  const timelineEntries = (() => {
    if (!overview?.timeline) return []
    let list = [...overview.timeline]

    if (timelineQuery.trim()) {
      const q = timelineQuery.toLowerCase().trim()
      list = list.filter((r) => {
        const name = (r.filename || r.report_id).toLowerCase()
        const date = (r.effective_date || '').toLowerCase()
        return name.includes(q) || date.includes(q)
      })
    }

    list.sort((a, b) => {
      const dateA = a.effective_date ? new Date(a.effective_date).getTime() : 0
      const dateB = b.effective_date ? new Date(b.effective_date).getTime() : 0
      return timelineSortAsc ? dateA - dateB : dateB - dateA
    })

    return list
  })()

  // Unique categories for biomarker filter
  const categories = (() => {
    if (!overview?.available_biomarkers) return ['all']
    const set = new Set<string>()
    overview.available_biomarkers.forEach((b) => {
      if (b.category) set.add(b.category)
    })
    return ['all', ...Array.from(set).sort()]
  })()

  // Filtered biomarker list
  const filteredBiomarkers = (() => {
    if (!overview?.available_biomarkers) return []
    return overview.available_biomarkers.filter((b) => {
      const matchesCat = biomarkerCategory === 'all' || b.category === biomarkerCategory
      const matchesQ =
        !biomarkerQuery.trim() ||
        b.test_name.toLowerCase().includes(biomarkerQuery.toLowerCase().trim()) ||
        (b.test_code && b.test_code.toLowerCase().includes(biomarkerQuery.toLowerCase().trim()))
      return matchesCat && matchesQ
    })
  })()

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Personal Lab History"
        title="Report Timeline & Trends"
        description="View your chronological laboratory records, compare test measurements across dates, and explore factual longitudinal trends."
        actions={
          <div className="history-header-actions">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadOverview()}
              disabled={loadingOverview}
            >
              <RefreshCw size={14} className={loadingOverview ? 'icon-spin' : undefined} />
              <span>Refresh</span>
            </Button>
            <ButtonLink to="/app/upload" variant="primary" size="sm">
              Upload Report
            </ButtonLink>
          </div>
        }
      />

      {/* Safety & Educational Banner */}
      <aside className="history-disclaimer-banner" role="note" aria-label="Medical records notice">
        <Info size={16} className="history-disclaimer-banner__icon" aria-hidden="true" />
        <div className="history-disclaimer-banner__text">
          <strong>Factual Health Record:</strong> Longitudinal observations are aggregated directly from your
          uploaded laboratory reports. Trends are mathematical differences between recorded numbers and do not
          diagnose conditions or substitute for professional medical follow-up. Reference intervals vary between
          different laboratories.
        </div>
      </aside>

      {/* History Tabs */}
      <nav className="history-tabs-nav" aria-label="History Navigation">
        <button
          type="button"
          className={`history-tab-btn ${activeTab === 'timeline' ? 'is-active' : ''}`}
          onClick={() => setTab('timeline')}
          aria-selected={activeTab === 'timeline'}
          role="tab"
        >
          <Calendar size={16} aria-hidden="true" />
          <span>Timeline</span>
          {overview && (
            <span className="history-tab-pill">{overview.total_reports}</span>
          )}
        </button>

        <button
          type="button"
          className={`history-tab-btn ${activeTab === 'compare' ? 'is-active' : ''}`}
          onClick={() => setTab('compare')}
          aria-selected={activeTab === 'compare'}
          role="tab"
        >
          <ArrowLeftRight size={16} aria-hidden="true" />
          <span>Compare Reports</span>
        </button>

        <button
          type="button"
          className={`history-tab-btn ${activeTab === 'trends' ? 'is-active' : ''}`}
          onClick={() => setTab('trends')}
          aria-selected={activeTab === 'trends'}
          role="tab"
        >
          <Activity size={16} aria-hidden="true" />
          <span>Biomarker Trends</span>
          {overview && (
            <span className="history-tab-pill">{overview.available_biomarkers.length}</span>
          )}
        </button>
      </nav>

      {/* Overview Error */}
      {overviewError && (
        <div className="history-error-alert" role="alert">
          <AlertTriangle size={16} />
          <span>{overviewError}</span>
        </div>
      )}

      {/* TAB 1: TIMELINE */}
      {activeTab === 'timeline' && (
        <section className="history-section" aria-label="Chronological Report Timeline">
          <div className="history-toolbar">
            <div className="history-toolbar__search">
              <Search size={15} aria-hidden="true" />
              <input
                type="text"
                placeholder="Search reports by filename or date..."
                value={timelineQuery}
                onChange={(e) => setTimelineQuery(e.target.value)}
                aria-label="Filter timeline reports"
              />
              {timelineQuery && (
                <button
                  type="button"
                  className="history-clear-btn"
                  onClick={() => setTimelineQuery('')}
                  aria-label="Clear timeline search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="history-toolbar__actions">
              <button
                type="button"
                className="history-sort-toggle"
                onClick={() => setTimelineSortAsc(!timelineSortAsc)}
                aria-label={`Sort by date: currently ${timelineSortAsc ? 'oldest first' : 'newest first'}`}
              >
                <ArrowUpDown size={14} />
                <span>{timelineSortAsc ? 'Oldest first' : 'Newest first'}</span>
              </button>
            </div>
          </div>

          {loadingOverview && (
            <div className="history-loading-wrap" role="status">
              <RefreshCw size={24} className="icon-spin" />
              <p>Loading your laboratory timeline...</p>
            </div>
          )}

          {!loadingOverview && timelineEntries.length === 0 && (
            <div className="history-empty-state">
              <History size={40} className="history-empty-icon" aria-hidden="true" />
              <h3>No laboratory reports found</h3>
              <p>
                {timelineQuery
                  ? 'No reports match your search query.'
                  : 'Upload your laboratory reports to start building your longitudinal health history.'}
              </p>
              <ButtonLink to="/app/upload" variant="primary" size="md">
                Upload your first report
              </ButtonLink>
            </div>
          )}

          {!loadingOverview && timelineEntries.length > 0 && (
            <ol className="history-timeline-list" aria-label="Timeline entries">
              {timelineEntries.map((entry, idx) => {
                const dateDisplay = entry.effective_date
                  ? new Date(entry.effective_date).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })
                  : 'Undated Report'

                return (
                  <li key={entry.report_id} className="history-timeline-item">
                    <div className="history-timeline-node">
                      <div className="history-timeline-dot" aria-hidden="true" />
                      {idx < timelineEntries.length - 1 && (
                        <div className="history-timeline-line" aria-hidden="true" />
                      )}
                    </div>

                    <article className="history-report-card">
                      <header className="history-report-card__header">
                        <div className="history-report-card__title-row">
                          <FileText size={18} className="history-report-card__icon" aria-hidden="true" />
                          <h4 className="history-report-card__title">
                            {entry.filename || `Report ${entry.report_id.slice(0, 8)}`}
                          </h4>
                          <span
                            className={`history-provenance-tag ${
                              entry.date_provenance === 'sample_date'
                                ? 'history-provenance-tag--report'
                                : 'history-provenance-tag--upload'
                            }`}
                            title={
                              entry.date_provenance === 'sample_date'
                                ? 'Extracted from laboratory specimen date'
                                : 'Specimen date not detected; using upload date'
                            }
                          >
                            <Calendar size={11} aria-hidden="true" />
                            {dateDisplay}
                            <span className="history-provenance-sub">
                              ({entry.date_provenance === 'sample_date' ? 'Report date' : 'Upload date'})
                            </span>
                          </span>
                        </div>

                        <div className="history-report-card__badges">
                          <StatusBadge
                            variant={entry.extraction_status === 'extracted' ? 'mint' : 'neutral'}
                          >
                            {entry.extraction_status}
                          </StatusBadge>
                          {entry.critical_flags_count > 0 && (
                            <span className="history-badge-critical" role="status">
                              <AlertTriangle size={12} />
                              {entry.critical_flags_count} critical flag
                              {entry.critical_flags_count > 1 ? 's' : ''}
                            </span>
                          )}
                          <span className="history-count-badge">
                            {entry.measurement_count} measurement
                            {entry.measurement_count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </header>

                      <div className="history-report-card__body">
                        <p className="history-report-card__subtext">
                          ID: <code className="doc-code">{entry.report_id}</code>
                          {entry.upload_date && (
                            <span> · Added {new Date(entry.upload_date).toLocaleDateString()}</span>
                          )}
                        </p>
                      </div>

                      <footer className="history-report-card__actions">
                        <Link
                          to={`/app/reports/${entry.report_id}`}
                          className="history-action-link"
                          aria-label={`Open report ${entry.filename || entry.report_id}`}
                        >
                          View Report Details
                          <ChevronRight size={14} aria-hidden="true" />
                        </Link>

                        {(overview?.timeline.length ?? 0) >= 2 && (
                          <button
                            type="button"
                            className="history-action-btn-compare"
                            onClick={() => handleCompareFromTimeline(entry.report_id)}
                          >
                            <ArrowLeftRight size={13} aria-hidden="true" />
                            Compare with another
                          </button>
                        )}
                      </footer>
                    </article>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      )}

      {/* TAB 2: COMPARE REPORTS */}
      {activeTab === 'compare' && (
        <section className="history-section" aria-label="Compare Laboratory Reports">
          <div className="history-compare-selector-card">
            <h3 className="history-subheading">Select Two Reports to Compare</h3>
            <p className="history-subheading-desc">
              Side-by-side comparison reveals numerical shifts, unit conversions, and tests only found in one report.
            </p>

            <div className="history-compare-controls">
              <div className="history-select-group">
                <label htmlFor="report-a-select">
                  <span className="history-select-label-tag">Report A (Earlier / Baseline)</span>
                </label>
                <select
                  id="report-a-select"
                  value={reportAId}
                  onChange={(e) => setReportAId(e.target.value)}
                  className="history-select"
                >
                  <option value="">— Choose first report —</option>
                  {overview?.timeline.map((r) => (
                    <option key={r.report_id} value={r.report_id}>
                      {r.filename || r.report_id} (
                      {r.effective_date ? new Date(r.effective_date).toLocaleDateString() : 'Undated'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="history-compare-swap-wrap">
                <button
                  type="button"
                  className="history-swap-btn"
                  onClick={handleSwapReports}
                  title="Swap Report A and Report B"
                  aria-label="Swap reports"
                  disabled={!reportAId || !reportBId}
                >
                  <ArrowLeftRight size={16} />
                </button>
              </div>

              <div className="history-select-group">
                <label htmlFor="report-b-select">
                  <span className="history-select-label-tag">Report B (Later / Follow-up)</span>
                </label>
                <select
                  id="report-b-select"
                  value={reportBId}
                  onChange={(e) => setReportBId(e.target.value)}
                  className="history-select"
                >
                  <option value="">— Choose second report —</option>
                  {overview?.timeline.map((r) => (
                    <option key={r.report_id} value={r.report_id}>
                      {r.filename || r.report_id} (
                      {r.effective_date ? new Date(r.effective_date).toLocaleDateString() : 'Undated'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="history-compare-action-wrap">
                <Button
                  variant="primary"
                  onClick={() => void handleRunComparison()}
                  disabled={comparing || !reportAId || !reportBId || reportAId === reportBId}
                >
                  <ArrowLeftRight size={15} />
                  <span>{comparing ? 'Comparing...' : 'Compare Reports'}</span>
                </Button>
              </div>
            </div>

            {reportAId && reportBId && reportAId === reportBId && (
              <p className="history-form-hint history-form-hint--warn" role="alert">
                Report A and Report B are identical. Please choose two distinct reports to calculate differences.
              </p>
            )}

            {compareError && (
              <div className="history-error-alert" role="alert">
                <AlertTriangle size={15} />
                <span>{compareError}</span>
              </div>
            )}
          </div>

          {/* Comparison Results */}
          {comparisonResult && (
            <div className="history-comparison-result-wrap">
              <header className="history-comparison-result-header">
                <div>
                  <h4 className="history-comparison-title">
                    Comparison Results ({comparisonResult.comparisons.length} shared measurements)
                  </h4>
                  <p className="history-comparison-sub">
                    Calculated differences reflect changes between recorded values.
                  </p>
                </div>
              </header>

              {comparisonResult.comparisons.length === 0 ? (
                <div className="history-empty-inline">
                  <Info size={18} />
                  <span>No shared canonical test measurements were found between these two reports.</span>
                </div>
              ) : (
                <div className="trend-table-wrap">
                  <table className="trend-data-table" aria-label="Measurement comparison table">
                    <thead>
                      <tr>
                        <th scope="col">Test Name</th>
                        <th scope="col">Earlier Result</th>
                        <th scope="col">Latest Result</th>
                        <th scope="col">Recorded Difference</th>
                        <th scope="col">Trend Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonResult.comparisons.map((c) => {
                        const hasDiff = c.absolute_difference !== null
                        const isHigher = hasDiff && c.absolute_difference! > 0
                        const isLower = hasDiff && c.absolute_difference! < 0
                        const isZero = hasDiff && c.absolute_difference === 0

                        return (
                          <tr key={c.test_name}>
                            <td>
                              <strong>{c.test_name}</strong>
                              {c.limitations.length > 0 && (
                                <ul className="doc-limitations-list">
                                  {c.limitations.map((lim, i) => (
                                    <li key={i}>{lim}</li>
                                  ))}
                                </ul>
                              )}
                            </td>
                            <td>
                              <span className="doc-tabular">
                                <strong>{c.previous.value ?? '—'}</strong> {c.previous.unit ?? ''}
                              </span>
                              {c.previous.range && (
                                <span className="doc-subtext"> (Ref: {c.previous.range})</span>
                              )}
                            </td>
                            <td>
                              <span className="doc-tabular">
                                <strong>{c.latest.value ?? '—'}</strong> {c.latest.unit ?? ''}
                              </span>
                              {c.latest.range && (
                                <span className="doc-subtext"> (Ref: {c.latest.range})</span>
                              )}
                            </td>
                            <td>
                              {hasDiff ? (
                                <span
                                  className={`history-diff-badge ${
                                    isHigher
                                      ? 'history-diff-badge--higher'
                                      : isLower
                                      ? 'history-diff-badge--lower'
                                      : 'history-diff-badge--neutral'
                                  }`}
                                >
                                  {isHigher && <TrendingUp size={13} aria-hidden="true" />}
                                  {isLower && <TrendingDown size={13} aria-hidden="true" />}
                                  {isZero && <CheckCircle2 size={13} aria-hidden="true" />}
                                  <span>
                                    {isHigher ? '+' : ''}
                                    {c.absolute_difference} {c.latest.unit ?? ''}
                                    {c.percentage_difference !== null && (
                                      <> ({isHigher ? '+' : ''}{c.percentage_difference}%)</>
                                    )}
                                  </span>
                                </span>
                              ) : (
                                <span className="doc-subtext">Non-numeric or excluded</span>
                              )}
                            </td>
                            <td>
                              <button
                                type="button"
                                className="history-action-btn-small"
                                onClick={() => handleViewBiomarkerTrends(c.test_name)}
                                title={`Explore historical trends for ${c.test_name}`}
                              >
                                View full trend
                                <ChevronRight size={12} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {comparisonResult.disclaimer && (
                <footer className="history-disclaimer-card" role="note">
                  <p>{comparisonResult.disclaimer}</p>
                </footer>
              )}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: BIOMARKER TRENDS */}
      {activeTab === 'trends' && (
        <section className="history-section" aria-label="Biomarker Trend Explorer">
          <div className="history-biomarker-explorer">
            {/* Left/Top Filter Panel */}
            <aside className="history-biomarker-picker-card">
              <div className="history-biomarker-picker-header">
                <h3 className="history-subheading">Select Biomarker</h3>
                <span className="history-count-badge">
                  {filteredBiomarkers.length} available
                </span>
              </div>

              {/* Category selector */}
              <div className="history-category-pills" role="radiogroup" aria-label="Filter by category">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    className={`history-category-pill ${biomarkerCategory === cat ? 'is-active' : ''}`}
                    onClick={() => setBiomarkerCategory(cat)}
                    role="radio"
                    aria-checked={biomarkerCategory === cat}
                  >
                    {cat === 'all' ? 'All Panels' : cat}
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div className="history-toolbar__search">
                <Search size={14} aria-hidden="true" />
                <input
                  type="text"
                  placeholder="Filter biomarkers..."
                  value={biomarkerQuery}
                  onChange={(e) => setBiomarkerQuery(e.target.value)}
                  aria-label="Filter biomarker list"
                />
              </div>

              {/* Biomarker List */}
              <ul className="history-biomarker-list" role="listbox" aria-label="Available biomarkers">
                {filteredBiomarkers.map((b: BiomarkerSummaryItem) => {
                  const isSelected = selectedBiomarker.toLowerCase() === b.test_name.toLowerCase()
                  return (
                    <li key={b.test_name} role="option" aria-selected={isSelected}>
                      <button
                        type="button"
                        className={`history-biomarker-item-btn ${isSelected ? 'is-active' : ''}`}
                        onClick={() => handleViewBiomarkerTrends(b.test_name)}
                      >
                        <div className="history-biomarker-item-text">
                          <span className="history-biomarker-item-title">{b.test_name}</span>
                          <span className="history-biomarker-item-cat">{b.category}</span>
                        </div>
                        <span className="history-obs-count-badge">
                          {b.observation_count} obs
                        </span>
                      </button>
                    </li>
                  )
                })}
                {filteredBiomarkers.length === 0 && (
                  <li className="history-biomarker-empty">No biomarkers found.</li>
                )}
              </ul>
            </aside>

            {/* Right/Bottom Trend Display */}
            <main className="history-trend-main" aria-label="Selected biomarker longitudinal analysis">
              {loadingBiomarker && (
                <div className="history-loading-wrap" role="status">
                  <RefreshCw size={24} className="icon-spin" />
                  <p>Loading historical observations for {selectedBiomarker}...</p>
                </div>
              )}

              {biomarkerError && (
                <div className="history-error-alert" role="alert">
                  <AlertTriangle size={16} />
                  <span>{biomarkerError}</span>
                </div>
              )}

              {!loadingBiomarker && !biomarkerError && biomarkerHistory && (
                <div className="history-trend-content">
                  {/* Biomarker Heading & Stats */}
                  <header className="history-trend-header">
                    <div>
                      <span className="history-panel-tag">{biomarkerHistory.category}</span>
                      <h3 className="history-trend-title">{biomarkerHistory.test_name}</h3>
                    </div>

                    <div className="history-trend-stats">
                      <div className="history-stat-card">
                        <span className="history-stat-val">{biomarkerHistory.total_observations}</span>
                        <span className="history-stat-lbl">Total Observations</span>
                      </div>
                      <div className="history-stat-card">
                        <span className="history-stat-val">{biomarkerHistory.summary.eligible_count}</span>
                        <span className="history-stat-lbl">Verified Numeric</span>
                      </div>
                    </div>
                  </header>

                  {/* Trend Summary Card */}
                  {biomarkerHistory.summary.recorded_difference ? (
                    <div className="history-summary-card">
                      <div className="history-summary-card__left">
                        <span className="history-summary-card__eyebrow">Calculated Longitudinal Change</span>
                        <div className="history-summary-card__diff">
                          <span
                            className={`history-summary-card__direction history-summary-card__direction--${biomarkerHistory.summary.recorded_difference.direction}`}
                          >
                            {biomarkerHistory.summary.recorded_difference.direction === 'higher' && (
                              <TrendingUp size={18} />
                            )}
                            {biomarkerHistory.summary.recorded_difference.direction === 'lower' && (
                              <TrendingDown size={18} />
                            )}
                            {biomarkerHistory.summary.recorded_difference.direction === 'unchanged' && (
                              <CheckCircle2 size={18} />
                            )}
                            <span>
                              {biomarkerHistory.summary.recorded_difference.direction === 'higher'
                                ? 'Higher'
                                : biomarkerHistory.summary.recorded_difference.direction === 'lower'
                                ? 'Lower'
                                : 'Unchanged'}
                            </span>
                          </span>

                          <span className="history-summary-card__value">
                            {biomarkerHistory.summary.recorded_difference.absolute_change > 0 ? '+' : ''}
                            {biomarkerHistory.summary.recorded_difference.absolute_change}{' '}
                            {biomarkerHistory.summary.recorded_difference.unit ?? ''}
                          </span>

                          {biomarkerHistory.summary.recorded_difference.percentage_change !== null && (
                            <span className="history-summary-card__pct">
                              ({biomarkerHistory.summary.recorded_difference.percentage_change > 0 ? '+' : ''}
                              {biomarkerHistory.summary.recorded_difference.percentage_change}%)
                            </span>
                          )}
                        </div>
                        <p className="history-summary-card__statement">
                          {biomarkerHistory.summary.status_message}
                        </p>
                      </div>

                      <div className="history-summary-card__right">
                        <div className="history-val-pair">
                          <span className="history-val-pair__lbl">Earlier observation:</span>
                          <span className="history-val-pair__val">
                            {biomarkerHistory.summary.recorded_difference.earlier_value}{' '}
                            {biomarkerHistory.summary.recorded_difference.unit ?? ''}
                          </span>
                        </div>
                        <div className="history-val-pair">
                          <span className="history-val-pair__lbl">Latest observation:</span>
                          <span className="history-val-pair__val">
                            {biomarkerHistory.summary.recorded_difference.latest_value}{' '}
                            {biomarkerHistory.summary.recorded_difference.unit ?? ''}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="history-single-notice" role="status">
                      <Info size={16} />
                      <span>{biomarkerHistory.summary.status_message}</span>
                    </div>
                  )}

                  {/* Review Notice */}
                  {biomarkerHistory.summary.needs_review_count > 0 && (
                    <div className="history-review-notice" role="alert">
                      <AlertTriangle size={15} />
                      <span>
                        Notice: {biomarkerHistory.summary.needs_review_count} measurement
                        {biomarkerHistory.summary.needs_review_count > 1 ? 's' : ''} require
                        human verification and {biomarkerHistory.summary.needs_review_count > 1 ? 'were' : 'was'}{' '}
                        withheld from numerical trend calculation.
                      </span>
                    </div>
                  )}

                  {/* SVG Chart & Accessible Data Table */}
                  <div className="history-chart-wrapper">
                    <h4 className="history-subheading">Trend Visualization</h4>
                    <TrendChart
                      observations={biomarkerHistory.observations}
                      testName={biomarkerHistory.test_name}
                    />
                  </div>

                  {/* Observations Table with links to original reports */}
                  <div className="history-observations-section">
                    <h4 className="history-subheading">Recorded Report Sources</h4>
                    <div className="trend-table-wrap">
                      <table className="trend-data-table" aria-label="Source report observations table">
                        <thead>
                          <tr>
                            <th scope="col">Date</th>
                            <th scope="col">Recorded Value</th>
                            <th scope="col">Laboratory Reference Interval</th>
                            <th scope="col">Laboratory Flag</th>
                            <th scope="col">Status</th>
                            <th scope="col">Source Report</th>
                          </tr>
                        </thead>
                        <tbody>
                          {biomarkerHistory.observations.map((obs) => (
                            <tr key={obs.measurement_id}>
                              <td>
                                <strong>
                                  {obs.date ? new Date(obs.date).toLocaleDateString() : 'Undated'}
                                </strong>
                                <span className="doc-subtext">
                                  {' '}
                                  ({obs.date_provenance === 'sample_date' ? 'Report date' : 'Upload date'})
                                </span>
                              </td>
                              <td className="doc-tabular">
                                <strong>{obs.value_original}</strong> {obs.unit ?? ''}
                              </td>
                              <td className="doc-tabular">
                                {obs.reference_range ?? 'Not specified'}
                              </td>
                              <td>
                                {obs.lab_flag ? (
                                  <span
                                    className={`doc-flag-badge ${
                                      obs.lab_flag.toLowerCase().includes('crit')
                                        ? 'doc-flag-badge--critical'
                                        : 'doc-flag-badge--warn'
                                    }`}
                                  >
                                    {obs.lab_flag}
                                  </span>
                                ) : (
                                  <span className="doc-subtext">Normal / None</span>
                                )}
                              </td>
                              <td>
                                <StatusBadge
                                  variant={obs.verification_status === 'verified' ? 'mint' : 'amber'}
                                >
                                  {obs.verification_status}
                                </StatusBadge>
                              </td>
                              <td>
                                <Link
                                  to={`/app/reports/${obs.report_id}`}
                                  className="history-source-link"
                                  title={`Open report ${obs.filename ?? obs.report_id}`}
                                >
                                  {obs.filename ?? obs.report_id.slice(0, 8)}
                                  <ExternalLink size={11} aria-hidden="true" />
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Educational Reference Range Note */}
                  <div className="history-reference-note" role="note">
                    <Info size={15} aria-hidden="true" />
                    <p>
                      <strong>Laboratory Variation Note:</strong> Reference intervals printed above are those
                      provided by the specific laboratory performing each test. Laboratories use different testing
                      equipment, reagent lots, and reference populations. A change across different laboratories
                      should be evaluated by a healthcare professional.
                    </p>
                  </div>

                  {/* Disclaimer */}
                  {biomarkerHistory.disclaimer && (
                    <footer className="history-disclaimer-card" role="note">
                      <p>{biomarkerHistory.disclaimer}</p>
                    </footer>
                  )}
                </div>
              )}
            </main>
          </div>
        </section>
      )}
    </PageContainer>
  )
}
