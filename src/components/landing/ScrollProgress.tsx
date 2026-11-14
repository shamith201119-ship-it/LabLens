import { useEffect, useRef } from 'react'

/**
 * A thin reading-progress line pinned to the top of the landing page.
 * One passive scroll listener plus a single rAF update keeps it cheap on
 * low-end hardware; it is purely decorative and never intercepts pointer input.
 */
export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0

    const update = () => {
      frame = 0
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0

      if (bar.current) {
        bar.current.style.transform = `scale3d(${progress.toFixed(4)}, 1, 1)`
      }
    }

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })

    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return (
    <div className="scroll-progress" aria-hidden="true">
      <div className="scroll-progress__bar" ref={bar} />
    </div>
  )
}
