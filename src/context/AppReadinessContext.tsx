import { useEffect, useState, type ReactNode } from 'react'
import { prefersReducedMotion } from '../lib/motionEnvironment'
import { AppReadinessContext } from './appReadiness'

export function AppReadinessProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => prefersReducedMotion())

  useEffect(() => {
    if (ready) {
      document.documentElement.dataset.appReady = 'true'
      return undefined
    }

    let cancelled = false
    const finish = () => {
      if (cancelled) return
      document.documentElement.dataset.appReady = 'true'
      setReady(true)
    }

    // Safety net: the application must never be held hostage by a font request.
    const safety = window.setTimeout(finish, 2200)

    // Minimum branded beat so a fast machine never flashes a single loader frame.
    const minBeat = new Promise<void>((resolve) => {
      window.setTimeout(resolve, 450)
    })
    const fontsSettled: Promise<void> = document.fonts?.ready
      ? Promise.race([
          document.fonts.ready.then(
            () => undefined,
            () => undefined,
          ),
          new Promise<void>((resolve) => window.setTimeout(resolve, 1500)),
        ])
      : Promise.resolve()

    Promise.all([minBeat, fontsSettled]).then(() => {
      // Wait for the browser to commit the first frame with content beneath.
      requestAnimationFrame(() => requestAnimationFrame(finish))
    })

    return () => {
      cancelled = true
      window.clearTimeout(safety)
    }
  }, [ready])

  return (
    <AppReadinessContext.Provider value={ready}>
      {children}
    </AppReadinessContext.Provider>
  )
}
