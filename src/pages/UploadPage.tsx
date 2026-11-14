import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CircleCheck,
  FlaskConical,
  LockKeyhole,
  ShieldCheck,
} from 'lucide-react'
import { Button, ButtonLink } from '../components/Button'
import { FileDropzone } from '../components/FileDropzone'
import { FilePreview } from '../components/FilePreview'
import { ProcessingExperience } from '../components/ProcessingExperience'
import { validateFileSelection } from '../lib/files'
import { MAX_FILE_SIZE_LABEL } from '../lib/product'
import { uploadReport } from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'

type UploadStage = 'select' | 'processing' | 'done'

export function UploadPage() {
  usePageTitle('Analyse a report — LabLens')
  const navigate = useNavigate()

  const [stage, setStage] = useState<UploadStage>('select')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedId, setUploadedId] = useState<string | null>(null)

  const handleFilesSelected = (files: File[]) => {
    if (files.length === 0) return
    const selectionError = validateFileSelection(files)
    if (selectionError) {
      setError(selectionError)
      setFile(null)
      return
    }
    setError(null)
    setFile(files[0])
  }

  const handleRemove = () => {
    setFile(null)
    setError(null)
  }

  const handleStart = async () => {
    if (!file || !consent) return
    setUploading(true)
    setError(null)
    try {
      const report = await uploadReport(file, true)
      setUploadedId(report.id)
      setStage('processing')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleProcessingComplete = () => {
    setStage('done')
  }

  const handleViewResults = () => {
    if (uploadedId) {
      navigate(`/app/reports/${uploadedId}/verify`)
    }
  }

  if (stage === 'processing' && uploadedId) {
    return (
      <ProcessingExperience
        reportId={uploadedId}
        onComplete={handleProcessingComplete}
        onViewResults={handleViewResults}
      />
    )
  }

  if (stage === 'done' && uploadedId) {
    return (
      <div className="upload-done-page">
        <div className="upload-done-card">
          <div className="upload-done-icon" aria-hidden="true">
            <CircleCheck size={32} strokeWidth={1.5} />
          </div>
          <h1>Your report is ready to review.</h1>
          <p>We&apos;ve extracted and organised your measurements. Let&apos;s make sure they match the original document.</p>
          <div className="upload-done-actions">
            <Button variant="lime" size="lg" onClick={handleViewResults}>
              Review &amp; verify results
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <ButtonLink to="/app" variant="ghost">
              Go to dashboard
            </ButtonLink>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="upload-page">
      <header className="upload-page-header">
        <span className="upload-page-brand">
          <FlaskConical size={16} strokeWidth={1.8} aria-hidden="true" />
          LabLens
        </span>
        <ButtonLink to="/app" variant="ghost" size="sm">
          Dashboard
        </ButtonLink>
      </header>

      <main className="upload-page-main">
        <div className="upload-page-intro">
          <p className="upload-page-eyebrow">Step 1 of 1</p>
          <h1 className="upload-page-title">Choose your lab report</h1>
          <p className="upload-page-sub">
            Select a PDF or image of your laboratory report. The file is stored only on this
            computer — nothing is sent to any server.
          </p>
        </div>

        <div className="upload-page-card">
          <FileDropzone onFilesSelected={handleFilesSelected} error={error} />
          {file ? <FilePreview file={file} onRemove={handleRemove} /> : null}

          {file ? (
            <div className="upload-page-consent">
              <label className="upload-consent-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                <span>
                  I understand this file will be stored on this computer only and that I can delete it at any time.
                </span>
              </label>

              <div className="upload-page-actions">
                <Button
                  variant="lime"
                  size="lg"
                  onClick={handleStart}
                  disabled={!consent || uploading}
                  className="upload-page-cta"
                >
                  <LockKeyhole size={15} aria-hidden="true" />
                  {uploading ? 'Uploading…' : 'Start analysis'}
                  {!uploading && <ArrowRight size={15} aria-hidden="true" />}
                </Button>
                {error ? (
                  <p className="upload-page-error" role="alert">{error}</p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="upload-page-rail">
          {[
            'PDF, JPG, JPEG or PNG',
            `Up to ${MAX_FILE_SIZE_LABEL}`,
            'The original, complete document',
            'No cloud upload — local only',
          ].map((point) => (
            <span key={point} className="upload-page-rail-item">
              <CircleCheck size={12} strokeWidth={2} aria-hidden="true" />
              {point}
            </span>
          ))}
        </div>

        <div className="upload-page-trust">
          <ShieldCheck size={13} strokeWidth={2} aria-hidden="true" />
          <span>Your file is validated locally. No content is read until you confirm.</span>
        </div>
      </main>
    </div>
  )
}
