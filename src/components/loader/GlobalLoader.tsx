import { useEffect, useState } from 'react'
import { useAppReady } from '../../context/appReadiness'
import { prefersReducedMotion } from '../../lib/motionEnvironment'

function LoaderMark() {
  return (
    <svg
      className="global-loader__mark"
      viewBox="0 0 36 36"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="36" height="36" rx="11" fill="#12251F" />
      <circle cx="18" cy="18" r="8.4" fill="none" stroke="#C9F277" strokeWidth="2.5" />
      <circle cx="23" cy="13" r="2.6" fill="#78CFC0" />
    </svg>
  )
}

/**
 * One-per-page-load branded launch screen. Shown above the application;
 * exits as a single choreographed beat when the readiness signal flips.
 * Regular route navigation never re-triggers it.
 */
export function GlobalLoader() {
  const ready = useAppReady()
  const reduceMotion = prefersReducedMotion()
  const [seen, setSeen] = useState(() => prefersReducedMotion())

  useEffect(() => {
    if (!ready || seen) return undefined
    const timeout = window.setTimeout(
      () => setSeen(true),
      reduceMotion ? 0 : 720,
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
      {/* Editorial ghost word */}
      <span className="global-loader__ghost" aria-hidden="true">
        LabLens
      </span>

      <div className="global-loader__inner">
        <div className="global-loader__topline">
          <span className="global-loader__badge">
            <span className="global-loader__badge-dot" aria-hidden="true" />
            Local &amp; private
          </span>
          <span className="global-loader__docnum">Lab-Lens / 0.1</span>
        </div>

        <div className="global-loader__body">
          <LoaderMark />
          <p className="global-loader__word">
            Lab<span>Lens</span>
          </p>
          <p className="global-loader__tagline">
            Your lab report, in plain language.
          </p>
        </div>

        <div className="global-loader__trace" aria-hidden="true">
          <span className="global-loader__trace-track" />
          <span className="global-loader__trace-segment" />
        </div>

        <p className="global-loader__caption">Preparing your report workspace</p>
      </div>
    </div>
  )
}
