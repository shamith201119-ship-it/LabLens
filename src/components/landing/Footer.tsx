import { ArrowUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BrandLogo } from '../BrandLogo'

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Capabilities', href: '#product' },
      { label: 'Understanding results', href: '#understanding' },
      { label: 'Safety', href: '#safety' },
    ],
  },
  {
    title: 'Workspace',
    links: [
      { label: 'Overview', href: '/app' },
      { label: 'My reports', href: '/app/reports' },
      { label: 'New analysis', href: '/app/upload' },
      { label: 'Settings', href: '/app/settings' },
    ],
  },
  {
    title: 'The project',
    links: [
      { label: 'About LabLens', href: '#about' },
      { label: 'What changes over time', href: '#timeline' },
      { label: 'Lab history', href: '/app/history' },
      { label: 'Safety & boundaries', href: '#safety' },
    ],
  },
]

function FooterLink({ href, label }: { href: string; label: string }) {
  if (href.startsWith('/')) {
    return <Link to={href}>{label}</Link>
  }
  return <a href={href}>{label}</a>
}

export function Footer() {
  return (
    <footer className="landing-footer on-dark">
      <div className="landing-container">
        <div className="footer-grid">
          <div className="footer-brand">
            <BrandLogo to="/" theme="dark" />
            <p>
              A health-literacy tool that helps people read lab reports with
              more context and prepare for better conversations with their
              clinician.
            </p>
            <span className="footer-brand__tag">
              Local-first · Your data stays here
            </span>
          </div>

          {columns.map((column) => (
            <nav className="footer-col" key={column.title} aria-label={column.title}>
              <h3>{column.title}</h3>
              {column.links.map((link) => (
                <FooterLink
                  key={`${column.title}-${link.label}`}
                  href={link.href}
                  label={link.label}
                />
              ))}
            </nav>
          ))}
        </div>

        <div className="footer-bottom">
          <p className="footer-bottom__disclaimer">
            LabLens provides educational context, not medical advice, diagnosis
            or treatment. Always discuss your results with a qualified
            healthcare professional. Illustrations on this site use synthetic
            data.
          </p>
          <p className="footer-bottom__meta">
            © 2026 LabLens
            <br />
            Local &amp; private · No data collected
          </p>
        </div>

        <div className="footer-base">
          <a className="footer-top" href="#main-content">
            Back to top
            <ArrowUp size={12} aria-hidden="true" />
          </a>
          <span className="footer-base__note">
            Reading, with context · <span className="num">2026</span>
          </span>
        </div>

      </div>
    </footer>
  )
}
