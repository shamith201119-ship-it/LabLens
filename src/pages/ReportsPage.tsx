import { useEffect, useMemo, useState } from 'react'
import {
  Download,
  FileText,
  Info,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Button, ButtonLink } from '../components/Button'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { StatusBadge } from '../components/StatusBadge'
import type { ApiReport } from '../lib/api'
import {
  deleteAllReports,
  deleteReport,
  downloadUrl,
  listReports,
} from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'

export function ReportsPage() {
  usePageTitle('My reports — LabLens')
  const [query, setQuery] = useState('')
  const [reports, setReports] = useState<ApiReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = async () => {
    setError(null)
    try {
      const data = await listReports()
      setReports(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const normalizedQuery = query.trim().toLowerCase()
  const matchingReports = useMemo(() => {
    if (!normalizedQuery) return reports
    return reports.filter((report) => {
      const haystack = `${report.original_filename}`.toLowerCase()
      return haystack.includes(normalizedQuery)
    })
  }, [reports, normalizedQuery])

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this report and its stored file?')) return
    setBusy(true)
    try {
      await deleteReport(id)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteAll = async () => {
    if (!window.confirm('Delete all stored reports and files?')) return
    setBusy(true)
    try {
      await deleteAllReports()
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete all failed')
    } finally {
      setBusy(false)
    }
  }

  const totalLabel = `${reports.length} ${reports.length === 1 ? 'report' : 'reports'}`

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Library"
        title="My reports"
        description="Reports stored locally on this computer by the LabLens backend. Nothing is uploaded to any external service."
        actions={
          <ButtonLink to="/app/upload" variant="lime">
            Analyse a report
          </ButtonLink>
        }
      />

      <div className="library-toolbar">
        <div className="library-toolbar__search">
          <label className="sr-only" htmlFor="report-search">
            Search reports
          </label>
          <div className="search-field">
            <Search size={15} strokeWidth={1.9} aria-hidden="true" />
            <input
              id="report-search"
              type="search"
              placeholder="Search reports"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                className="search-field__clear"
                aria-label="Clear search"
                onClick={() => setQuery('')}
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="library-toolbar__meta">
          <span className="library-toolbar__count">{totalLabel}</span>
          <StatusBadge variant="neutral" dot={false}>
            Stored locally
          </StatusBadge>
          {reports.length > 0 ? (
            <Button variant="quiet" size="sm" onClick={handleDeleteAll} disabled={busy}>
              Delete all
            </Button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <p className="library-note">Loading reports…</p>
      ) : error ? (
        <p className="library-note">{error}</p>
      ) : matchingReports.length === 0 ? (
        <div className="library-empty">
          <div className="empty-state">
            <div className="empty-state__icon" aria-hidden="true">
              <FileText size={24} strokeWidth={1.7} />
            </div>
            <h3>{reports.length === 0 ? 'Your library is empty' : 'No matching reports'}</h3>
            <p>
              {reports.length === 0
                ? 'No reports stored yet. Add a report to keep the original document locally.'
                : 'No reports match your search.'}
            </p>
            <div className="empty-state__actions">
              <ButtonLink to="/app/upload" variant="primary" size="sm">
                Analyse a report
              </ButtonLink>
            </div>
          </div>
        </div>
      ) : (
        <ul className="report-list">
          {matchingReports.map((report) => (
            <li key={report.id} className="report-row">
              <div className="report-row__main">
                <FileText size={16} aria-hidden="true" />
                <div>
                  <strong>{report.original_filename}</strong>
                  <span>
                    {report.file_extension.toUpperCase()} ·{' '}
                    {(report.file_size_bytes / 1024).toFixed(1)} KB ·{' '}
                    {new Date(report.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="report-row__actions">
                <ButtonLink
                  to={`/app/reports/${report.id}/results`}
                  variant="lime"
                  size="sm"
                >
                  Results
                </ButtonLink>
                <ButtonLink
                  to={`/app/reports/${report.id}`}
                  variant="primary"
                  size="sm"
                >
                  View
                </ButtonLink>
                <a
                  className="btn btn--secondary btn--sm"
                  href={downloadUrl(report.id)}
                  download
                >
                  <Download size={13} aria-hidden="true" />
                  Download
                </a>
                <Button
                  variant="quiet"
                  size="sm"
                  onClick={() => handleDelete(report.id)}
                  disabled={busy}
                >
                  <Trash2 size={13} aria-hidden="true" />
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="library-note">
        <Info size={11} aria-hidden="true" />
        <span>
          Files are stored locally on this computer only. Use Results to view analysis and explanations.
        </span>
      </p>
    </PageContainer>
  )
}
