import {
  ArrowRight,
  FileText,
  FlaskConical,
  History,
  LockKeyhole,
  MapPin,
} from 'lucide-react'
import { ButtonLink } from '../components/Button'
import { PageContainer, PageHeader } from '../components/PageHeader'
import { usePageTitle } from '../lib/usePageTitle'

const quickLinks = [
  {
    icon: FlaskConical,
    label: 'Analyse a report',
    description: 'Upload a new laboratory report and walk through the full analysis.',
    to: '/app/upload',
    variant: 'lime' as const,
  },
  {
    icon: FileText,
    label: 'My reports',
    description: 'View, open and manage all previously uploaded reports.',
    to: '/app/reports',
    variant: 'secondary' as const,
  },
  {
    icon: History,
    label: 'Lab history',
    description: 'Explore your biomarker trends and compare results across reports.',
    to: '/app/history',
    variant: 'secondary' as const,
  },
  {
    icon: MapPin,
    label: 'Find care',
    description: 'Locate healthcare providers and official patient resources.',
    to: '/app/reports',
    variant: 'secondary' as const,
  },
]

export function DashboardPage() {
  usePageTitle('Dashboard — LabLens')

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Dashboard"
        title="Welcome back."
        description="Your laboratory reports, all in one place."
        actions={
          <ButtonLink to="/app/upload" variant="lime">
            Analyse a report
            <ArrowRight size={15} className="btn__arrow" aria-hidden="true" />
          </ButtonLink>
        }
      />

      <div className="dashboard8-grid">
        {quickLinks.map((link) => {
          const Icon = link.icon
          return (
            <div key={link.to + link.label} className="dashboard8-card">
              <div className="dashboard8-card__icon" aria-hidden="true">
                <Icon size={20} strokeWidth={1.7} />
              </div>
              <div className="dashboard8-card__body">
                <h2 className="dashboard8-card__title">{link.label}</h2>
                <p className="dashboard8-card__desc">{link.description}</p>
              </div>
              <ButtonLink
                to={link.to}
                variant={link.variant}
                size="sm"
                className="dashboard8-card__cta"
              >
                Open
                <ArrowRight size={13} aria-hidden="true" />
              </ButtonLink>
            </div>
          )
        })}
      </div>

      <div className="dashboard8-trust">
        <LockKeyhole size={12} strokeWidth={2} aria-hidden="true" />
        <span>All data is stored locally on this computer. Nothing is sent to external servers.</span>
      </div>
    </PageContainer>
  )
}
