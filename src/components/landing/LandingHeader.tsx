import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronRight, Menu, X } from 'lucide-react'
import { BrandLogo } from '../BrandLogo'
import { ButtonLink } from '../Button'

const NAV_LINKS = [
  { label: 'Product', href: '#product' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Safety', href: '#safety' },
  { label: 'About', href: '#about' },
]

export function LandingHeader() {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!isMenuOpen) return undefined

    const frame = window.requestAnimationFrame(() => {
      firstLinkRef.current?.focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
        toggleRef.current?.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isMenuOpen])

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1020) setIsMenuOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <header
      className={`landing-header${isScrolled ? ' is-scrolled' : ''}`}
    >
      <div className="landing-nav">
        <BrandLogo to="/" />

        <nav className="landing-nav__links" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.href} className="landing-nav__link" href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="landing-nav__actions">
          <ButtonLink to="/app/start" variant="primary" size="sm">
            Open LabLens
          </ButtonLink>
          <button
            ref={toggleRef}
            type="button"
            className="landing-nav__toggle"
            aria-expanded={isMenuOpen}
            aria-controls="landing-mobile-menu"
            aria-label={isMenuOpen ? 'Close navigation' : 'Open navigation'}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? (
              <X size={19} aria-hidden="true" />
            ) : (
              <Menu size={19} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isMenuOpen ? (
          <motion.div
            id="landing-mobile-menu"
            className="landing-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="landing-menu__inner">
              <nav aria-label="Mobile primary">
                {NAV_LINKS.map((link, index) => (
                  <a
                    key={link.href}
                    ref={index === 0 ? firstLinkRef : undefined}
                    className="landing-menu__link"
                    href={link.href}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {link.label}
                    <ChevronRight size={17} aria-hidden="true" />
                  </a>
                ))}
              </nav>
              <div className="landing-menu__footer">
                <ButtonLink
                  to="/app/start"
                  variant="primary"
                  block
                  onClick={() => setIsMenuOpen(false)}
                >
                  Open LabLens
                </ButtonLink>
                <p className="landing-menu__note">
                  Reports are processed on this machine. Nothing you upload ever
                  leaves your device.
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  )
}
