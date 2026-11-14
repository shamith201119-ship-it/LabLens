import { Link } from 'react-router-dom'
import { ArrowRight, Compass, FileText } from 'lucide-react'
import { BrandLogo } from '../components/BrandLogo'
import { ButtonLink } from '../components/Button'
import { usePageTitle } from '../lib/usePageTitle'

export function NotFoundPage() {
  usePageTitle('Page not found — LabLens')

  return (
    <div className="landing not-found-page">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="landing-header">
        <div className="landing-nav">
          <BrandLogo />
        </div>
      </header>
      <main id="main-content" className="landing-container">
        <div className="not-found">
          <span className="not-found__code">Error 404</span>
          <h1>This page isn&apos;t here.</h1>
          <p>
            The link may be outdated or the page may have moved. Your
            workspace is still where you left it.
          </p>
          <div className="not-found__actions">
            <ButtonLink to="/app" variant="primary">
              Back to the workspace
              <ArrowRight size={15} aria-hidden="true" />
            </ButtonLink>
            <ButtonLink to="/" variant="secondary">
              <Compass size={14} aria-hidden="true" />
              Go to the homepage
            </ButtonLink>
          </div>
        </div>
      </main>
      <footer className="not-found-page__foot landing-container">
        <FileText size={12} aria-hidden="true" />
        <span>
          Looking for a report?{' '}
          <Link to="/app/reports">Open the report library</Link>
        </span>
      </footer>
    </div>
  )
}
