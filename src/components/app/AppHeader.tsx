import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Plus } from 'lucide-react'
import { BrandLogo } from '../BrandLogo'
import { ButtonLink } from '../Button'

interface Crumb {
  label: string
  to?: string
}

function getCrumbs(pathname: string): Crumb[] {
  const root: Crumb = { label: 'Workspace', to: '/app' }

  if (pathname === '/app') {
    return [root, { label: 'Overview' }]
  }

  if (pathname === '/app/settings') {
    return [root, { label: 'Settings' }]
  }

  if (pathname === '/app/reports') {
    return [root, { label: 'My reports' }]
  }

  if (pathname === '/app/reports/new') {
    return [
      root,
      { label: 'My reports', to: '/app/reports' },
      { label: 'New analysis' },
    ]
  }

  if (pathname.startsWith('/app/reports/')) {
    return [
      root,
      { label: 'My reports', to: '/app/reports' },
      { label: 'Report workspace' },
    ]
  }

  return [root, { label: 'Not found' }]
}

export function AppHeader() {
  const { pathname } = useLocation()
  const crumbs = getCrumbs(pathname)
  const showNewAnalysis = pathname !== '/app/upload' && pathname !== '/app/reports/new'

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__left">
          <div className="app-header__brand">
            <BrandLogo to="/app" size="sm" />
          </div>
          <nav aria-label="Breadcrumb">
            <ol className="breadcrumbs">
              {crumbs.map((crumb, index) => {
                const isLast = index === crumbs.length - 1
                return (
                  <li key={`${crumb.label}-${index}`}>
                    {crumb.to && !isLast ? (
                      <Link to={crumb.to}>{crumb.label}</Link>
                    ) : (
                      <span aria-current={isLast ? 'page' : undefined}>
                        {crumb.label}
                      </span>
                    )}
                    {!isLast ? (
                      <ChevronRight size={11} aria-hidden="true" />
                    ) : null}
                  </li>
                )
              })}
            </ol>
          </nav>
        </div>

        <div className="app-header__right">
          <span
            className="app-local"
            title="Local-first processing — reports never leave this computer"
          >
            <span className="app-local__dot" aria-hidden="true" />
            Local engine active
          </span>
          {showNewAnalysis ? (
            <ButtonLink
              to="/app/upload"
              variant="primary"
              size="sm"
              className="app-header__cta"
            >
              <Plus size={14} aria-hidden="true" />
              New analysis
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </header>
  )
}
