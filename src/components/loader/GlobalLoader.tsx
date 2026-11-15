import { useEffect, useState } from 'react'
import { useAppReady } from '../../context/appReadiness'
import { prefersReducedMotion } from '../../lib/motionEnvironment'

/**
 * One-per-page-load launch screen. Deliberately minimal: the wordmark and a
 * progress bar on a flat background — nothing else. Exits as soon as the app
 * shell is ready; regular route navigation never re-triggers it.
 */
export function GlobalLoader() {
  const ready = useAppReady()
  const reduceMotion = prefersReducedMotion()
  const [seen, setSeen] = useState(() => prefersReducedMotion())

  useEffect(() => {
    if (!ready || seen) return undefined
    const timeout = window.setTimeout(
      () => setSeen(true),
      reduceMotion ? 0 : 440,
    )
    return () => window.clearTimeout(timeout)
  }, [ready, seen, reduceMotion])

  // Lock document scroll while the loader owns the viewport.
  useEffect(() => {
    if (seen) {
      document.documentElement.classList.remove('loader-active')
      document.body.style.overflow = ''
      return undefined
    }
    const root = document.documentElement
    root.classList.add('loader-active')
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      root.classList.remove('loader-active')
      document.body.style.overflow = previous
    }
  }, [seen])

  if (seen) return null

  const exiting = ready && !reduceMotion

  return (
    <div
      className={`global-loader${exiting ? ' is-exiting' : ''}`}
      role="status"
      aria-label="LabLens is loading"
    >
      <div className="global-loader__inner">
        <p className="global-loader__word">
          Lab<span>Lens</span>
        </p>
        <div className="global-loader__bar" aria-hidden="true">
          <span className="global-loader__bar-fill" />
        </div>
      </div>
    </div>
  )
}
