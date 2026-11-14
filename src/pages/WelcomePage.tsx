import { Link } from 'react-router-dom'
import { ArrowRight, FlaskConical, ShieldCheck } from 'lucide-react'
import { ButtonLink } from '../components/Button'
import { usePageTitle } from '../lib/usePageTitle'

export function WelcomePage() {
  usePageTitle('LabLens — Your lab report, finally in plain language')

  return (
    <div className="welcome-page">
      <header className="welcome-header">
        <div className="welcome-header__inner">
          <Link to="/" className="welcome-brand" title="Back to LabLens homepage">
            <FlaskConical size={18} strokeWidth={1.8} aria-hidden="true" />
            LabLens
          </Link>
          <div className="welcome-header__nav">
            <Link to="/" className="welcome-header__link" style={{ marginRight: '16px' }}>
              Home
            </Link>
            <Link to="/app" className="welcome-header__link">
              Open dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="welcome-main">
        <div className="welcome-hero">
          {/* Illustration */}
          <div className="welcome-illustration" aria-hidden="true">
            <div className="welcome-doc">
              <div className="welcome-doc__page">
                <div className="welcome-doc__lines">
                  <span className="welcome-doc__line welcome-doc__line--title" />
                  <span className="welcome-doc__line" />
                  <span className="welcome-doc__line welcome-doc__line--short" />
                </div>
                <div className="welcome-doc__table">
                  <span className="welcome-doc__row welcome-doc__row--header" />
                  <span className="welcome-doc__row welcome-doc__row--high" />
                  <span className="welcome-doc__row" />
                  <span className="welcome-doc__row welcome-doc__row--low" />
                  <span className="welcome-doc__row" />
                  <span className="welcome-doc__row welcome-doc__row--high welcome-doc__row--critical" />
                </div>
              </div>
              <div className="welcome-doc__overlay">
                <span className="welcome-doc__pill welcome-doc__pill--mint">Within range</span>
                <span className="welcome-doc__pill welcome-doc__pill--amber">Needs review</span>
                <span className="welcome-doc__pill welcome-doc__pill--lime">Explained</span>
              </div>
            </div>
          </div>

          <div className="welcome-copy">
            <p className="welcome-eyebrow">Laboratory report understanding</p>
            <h1 className="welcome-headline">
              Your lab report.<br />
              Finally, in plain<br />
              language.
            </h1>
            <p className="welcome-subheadline">
              Upload a laboratory report. LabLens extracts your measurements,
              compares them to the laboratory reference intervals, and explains
              what each result means — clearly and without medical jargon.
            </p>

            <div className="welcome-ctas">
              <ButtonLink to="/app/upload" variant="lime" size="lg">
                Analyse a report
                <ArrowRight size={16} aria-hidden="true" />
              </ButtonLink>
              <ButtonLink to="/app" variant="ghost" size="lg">
                Open dashboard
              </ButtonLink>
            </div>

            <div className="welcome-trust">
              <ShieldCheck size={13} strokeWidth={2} aria-hidden="true" />
              <span>Stored only on this computer · No cloud · No tracking</span>
            </div>
          </div>
        </div>

        <div className="welcome-steps">
          <div className="welcome-steps__inner">
            <div className="welcome-step">
              <span className="welcome-step__num">01</span>
              <h3>Upload your report</h3>
              <p>PDF, JPG or PNG. The original file is stored locally on this computer only.</p>
            </div>
            <span className="welcome-step__sep" aria-hidden="true" />
            <div className="welcome-step">
              <span className="welcome-step__num">02</span>
              <h3>Extract &amp; analyse</h3>
              <p>Measurements are read, structured and compared with your laboratory&apos;s reference intervals.</p>
            </div>
            <span className="welcome-step__sep" aria-hidden="true" />
            <div className="welcome-step">
              <span className="welcome-step__num">03</span>
              <h3>Understand results</h3>
              <p>Each result is explained clearly. Prepare questions for your healthcare appointment.</p>
            </div>
          </div>
        </div>
      </main>

      <footer className="welcome-footer">
        <p>
          LabLens is an educational tool. It does not provide medical advice,
          diagnose conditions or recommend treatments.
        </p>
        <div style={{ display: 'flex', gap: '16px' }}>
          <Link to="/" className="welcome-footer__link">
            Main website
          </Link>
          <Link to="/app" className="welcome-footer__link">
            Dashboard
          </Link>
        </div>
      </footer>
    </div>
  )
}
