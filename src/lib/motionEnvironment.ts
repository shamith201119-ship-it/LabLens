/**
 * Reads the two independent motion signals used across the site:
 * the operating-system preference and the in-app preference in Settings.
 * Keeping this in one place avoids each animation choosing a different rule.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  return (
    document.documentElement.dataset.motion === 'reduced' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function hasFinePointer(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.matchMedia('(pointer: fine)').matches
}
