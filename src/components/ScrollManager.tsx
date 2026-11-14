import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Reset scroll on route changes and resolve cross-route hash links such as
 * /#safety from inside the application shell.
 */
export function ScrollManager() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      const targetId = hash.replace('#', '')
      const frame = window.requestAnimationFrame(() => {
        const target = document.getElementById(targetId)
        if (target) {
          target.scrollIntoView({ behavior: 'auto', block: 'start' })
        }
      })
      return () => window.cancelAnimationFrame(frame)
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    return undefined
  }, [pathname, hash])

  return null
}
