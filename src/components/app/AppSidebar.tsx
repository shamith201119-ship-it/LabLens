import { Link, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  ArrowUpRight,
  FileText,
  History,
  LayoutGrid,
  LockKeyhole,
  ScanLine,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { BrandLogo } from '../BrandLogo'
import { cx } from '../../lib/cx'
import { getActiveNavId } from '../../lib/navigation'

interface NavItem {
  id: string
  to: string
  label: string
  icon: LucideIcon
}

const workspaceItems: NavItem[] = [
  { id: 'overview', to: '/app', label: 'Overview', icon: LayoutGrid },
  { id: 'reports', to: '/app/reports', label: 'My reports', icon: FileText },
  { id: 'history', to: '/app/history', label: 'Lab History', icon: History },
  {
    id: 'new',
    to: '/app/upload',
    label: 'New analysis',
    icon: ScanLine,
  },
]

const accountItems: NavItem[] = [
  { id: 'settings', to: '/app/settings', label: 'Settings', icon: Settings2 },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  const activeId = getActiveNavId(pathname)

  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const active = item.id === activeId

    return (
      <Link
        key={item.id}
        to={item.to}
        className={cx('app-nav__item', active && 'is-active')}
        aria-current={active ? 'page' : undefined}
      >
        {active ? (
          <motion.span
            className="app-nav__active-bg"
            layoutId="app-sidebar-active"
            transition={{ type: 'spring', stiffness: 430, damping: 42 }}
          />
        ) : null}
        <span className="app-nav__icon" aria-hidden="true">
          <Icon size={17} strokeWidth={1.8} />
        </span>
        <span>{item.label}</span>
      </Link>
    )
  }

  return (
    <aside className="app-sidebar" aria-label="LabLens workspace">
      <div className="app-sidebar__brand">
        <BrandLogo to="/app" size="sm" />
      </div>

      <nav className="app-sidebar__nav" aria-label="Workspace">
        <p className="app-nav-label">Workspace</p>
        {workspaceItems.map(renderItem)}
        <p className="app-nav-label">Account</p>
        {accountItems.map(renderItem)}
      </nav>

      <div className="app-sidebar__bottom">
        <div className="sidebar-local">
          <div className="sidebar-local__head">
            <LockKeyhole size={13} strokeWidth={2} aria-hidden="true" />
            <span>Local &amp; private</span>
          </div>
          <p>
            Files are processed directly on this computer. Nothing is sent to external servers.
          </p>
          <Link to="/#safety">
            Safety &amp; privacy
            <ArrowUpRight size={10} aria-hidden="true" />
          </Link>
        </div>
        <p className="app-sidebar__meta">LabLens · Local Processing</p>
      </div>
    </aside>
  )
}
