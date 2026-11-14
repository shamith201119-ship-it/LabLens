import { Outlet, useLocation } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'
import { AppHeader } from './AppHeader'
import { MobileNav } from './MobileNav'
import { MotionPage } from '../motion'

export function AppLayout() {
  const location = useLocation()

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <AppSidebar />
      <div className="app-main">
        <AppHeader />
        <main id="main-content" tabIndex={-1}>
          <MotionPage key={location.pathname} className="app-page">
            <Outlet />
          </MotionPage>
        </main>
      </div>
      <MobileNav />
    </div>
  )
}
