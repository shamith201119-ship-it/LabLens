import { Link, useLocation } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  FileText,
  History,
  LayoutGrid,
  ScanLine,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { cx } from '../../lib/cx'
import { getActiveNavId } from '../../lib/navigation'

interface MobileNavItem {
  id: string
  to: string
  label: string
  icon: LucideIcon
}

const items: MobileNavItem[] = [
  { id: 'overview', to: '/app', label: 'Overview', icon: LayoutGrid },
  { id: 'reports', to: '/app/reports', label: 'Reports', icon: FileText },
  { id: 'history', to: '/app/history', label: 'History', icon: History },
  { id: 'new', to: '/app/upload', label: 'New analysis', icon: ScanLine },
  { id: 'settings', to: '/app/settings', label: 'Settings', icon: Settings2 },
]

export function MobileNav() {
  const { pathname } = useLocation()
  const activeId = getActiveNavId(pathname)

  return (
    <nav className="mobile-nav" aria-label="Mobile navigation">
      {items.map((item) => {
        const Icon = item.icon
        const active = item.id === activeId
        return (
          <Link
            key={item.id}
            to={item.to}
            className={cx('mobile-nav__item', active && 'is-active')}
            aria-current={active ? 'page' : undefined}
          >
            <span className="mobile-nav__icon" aria-hidden="true">
              {active ? (
                <motion.span
                  className="mobile-nav__active-bg"
                  layoutId="mobile-nav-active"
                  transition={{ type: 'spring', stiffness: 430, damping: 42 }}
                />
              ) : null}
              <Icon size={18} strokeWidth={1.9} />
            </span>
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
