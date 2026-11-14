import { Link } from 'react-router-dom'
import {
  Accessibility,
  ArrowUpRight,
  Info,
  LockKeyhole,
  MonitorCog,
  ShieldCheck,
  Waves,
} from 'lucide-react'
import { Button } from '../components/Button'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { useToast } from '../context/toast'
import { useMotionPreference } from '../context/preferences'
import type { MotionPreference } from '../context/preferences'
import { usePageTitle } from '../lib/usePageTitle'

const motionOptions: Array<{ value: MotionPreference; label: string }> = [
  { value: 'system', label: 'System default' },
  { value: 'reduced', label: 'Reduce motion' },
]

const privacyRows = [
  { label: 'Document upload', value: 'Processed on this device' },
  { label: 'Report storage', value: 'Stored locally on this device' },
  { label: 'Account & sign-in', value: 'Not required — single local workspace' },
  { label: 'Analytics & tracking', value: 'None' },
]

const aboutRows = [
  { label: 'Release', value: '0.1.0' },
  { label: 'Report processing', value: 'Local & private — this machine' },
  { label: 'Report records', value: 'Stored in your local workspace' },
  { label: 'Environment', value: 'Local application' },
]

export function SettingsPage() {
  usePageTitle('Settings — LabLens')
  const { preference, setPreference } = useMotionPreference()
  const { toast } = useToast()

  const handlePreferenceChange = (next: MotionPreference) => {
    if (next === preference) return
    setPreference(next)
    toast({
      title:
        next === 'reduced'
          ? 'Motion reduced'
          : 'Following system motion preference',
      description:
        next === 'reduced'
          ? 'Section reveals and interface transitions are now suppressed.'
          : 'The interface will respect your operating system setting.',
      variant: 'success',
    })
  }

  const handleReset = () => {
    setPreference('system')
    toast({
      title: 'Motion preference reset',
      description: 'The interface now follows your operating system setting.',
      variant: 'info',
    })
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Settings"
        title="Workspace settings"
        description="A small, honest set of controls. Preferences here apply only to this browser and are never sent anywhere."
      />

      <div className="settings-grid">
        <section className="card settings-card" aria-labelledby="reading-title">
          <div className="settings-card__head">
            <span className="settings-card__icon" aria-hidden="true">
              <MonitorCog size={16} strokeWidth={1.8} />
            </span>
            <div>
              <h2 id="reading-title">Reading experience</h2>
              <p>
                LabLens is light-only by design. Dark theme is not built yet.
              </p>
            </div>
          </div>
          <div className="settings-body">
            <div className="settings-list">
              <div className="settings-list__row">
                <span className="settings-list__label">Theme</span>
                <span className="settings-list__value">Light — fixed</span>
              </div>
              <div className="settings-list__row">
                <span className="settings-list__label">Headings</span>
                <span className="settings-list__value">Manrope</span>
              </div>
              <div className="settings-list__row">
                <span className="settings-list__label">Body</span>
                <span className="settings-list__value">Inter</span>
              </div>
              <div className="settings-list__row">
                <span className="settings-list__label">Numerals</span>
                <span className="settings-list__value">Tabular where compared</span>
              </div>
            </div>
          </div>
        </section>

        <section className="card settings-card" aria-labelledby="motion-title">
          <div className="settings-card__head">
            <span className="settings-card__icon" aria-hidden="true">
              <Waves size={16} strokeWidth={1.8} />
            </span>
            <div>
              <h2 id="motion-title">Motion &amp; accessibility</h2>
              <p>Choose how much animation the interface uses.</p>
            </div>
          </div>
          <div className="settings-body">
            <p>
              Section reveals and small transitions are intentionally subtle.
              Reduced motion keeps every state change visible without movement.
            </p>
            <div className="motion-row">
              <div className="motion-row__label">
                <strong>Motion preference</strong>
                <span>
                  Stored locally. The operating system setting is respected by
                  default.
                </span>
              </div>
              <div
                className="segmented"
                role="group"
                aria-label="Motion preference"
              >
                {motionOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className="segmented__option"
                    aria-pressed={preference === option.value}
                    onClick={() => handlePreferenceChange(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="settings-actions">
            <Button
              variant="quiet"
              size="sm"
              onClick={handleReset}
              disabled={preference === 'system'}
            >
              <Accessibility size={13} aria-hidden="true" />
              Reset to system
            </Button>
          </div>
        </section>

        <section
          className="card settings-card settings-card--full"
          aria-labelledby="privacy-title"
        >
          <div className="settings-card__head">
            <span className="settings-card__icon" aria-hidden="true">
              <LockKeyhole size={16} strokeWidth={1.8} />
            </span>
            <div>
              <h2 id="privacy-title">Data &amp; privacy</h2>
              <p>What LabLens does with your information.</p>
            </div>
          </div>
          <div className="settings-body">
            <div className="settings-list">
              {privacyRows.map((row) => (
                <div className="settings-list__row" key={row.label}>
                  <span className="settings-list__label">{row.label}</span>
                  <span className="settings-list__value">{row.value}</span>
                </div>
              ))}
            </div>
            <div className="settings-privacy">
              <ShieldCheck size={14} aria-hidden="true" />
              <p>
                LabLens runs entirely on this machine. Reports are uploaded
                from the upload screen, processed locally, stored only on this
                device and never shared. LabLens collects nothing — there is
                no analytics, account or external service involved.
              </p>
            </div>
            <Link className="settings-link" to="/#safety">
              Read the safety boundaries
              <ArrowUpRight size={11} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section
          className="card settings-card settings-card--full"
          aria-labelledby="about-product-title"
        >
          <div className="settings-card__head">
            <span className="settings-card__icon" aria-hidden="true">
              <Info size={16} strokeWidth={1.8} />
            </span>
            <div>
              <h2 id="about-product-title">About LabLens</h2>
              <p>
                A local-first workspace that reads your lab reports, checks you
                can trust what it read, and prepares better questions to ask a
                clinician.
              </p>
            </div>
          </div>
          <div className="settings-body">
            <div className="settings-list">
              {aboutRows.map((row) => (
                <div className="settings-list__row" key={row.label}>
                  <span className="settings-list__label">{row.label}</span>
                  <span className="settings-list__value">{row.value}</span>
                </div>
              ))}
            </div>
            <Link className="settings-link" to="/">
              Return to the product site
              <ArrowUpRight size={11} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </PageContainer>
  )
}
