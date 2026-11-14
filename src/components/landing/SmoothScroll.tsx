import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import Lenis from 'lenis'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { prefersReducedMotion } from '../../lib/motionEnvironment'

gsap.registerPlugin(ScrollTrigger)

/**
 * The single smooth-scroll implementation for the marketing site.
 *
 * Lenis is driven by the GSAP ticker so there is only one animation loop, and
 * ScrollTrigger is updated from Lenis rather than from its own scroll polling.
 * Touch devices and reduced-motion visitors keep native scrolling.
 */
export function SmoothScroll() {
  const lenisRef = useRef<Lenis | null>(null)
  const { pathname } = useLocation()

  useEffect(() => {
    const root = document.documentElement
    const finePointer = window.matchMedia('(pointer: fine)').matches

    // Always start at the top on a fresh load unless an anchor was requested.
    if (!window.location.hash) {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual'
      }
      window.scrollTo(0, 0)
    }

    if (prefersReducedMotion() || !finePointer) {
      return undefined
    }

    const lenis = new Lenis({
      autoRaf: false,
      lerp: 0.1,
      duration: 1.05,
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 0.92,
      touchMultiplier: 1.2,
      anchors: false,
    })

    lenisRef.current = lenis
    root.classList.add('smooth-scroll-active')

    if (!window.location.hash) {
      lenis.scrollTo(0, { immediate: true })
    }

    const previousScrollBehavior = root.style.scrollBehavior
    root.style.scrollBehavior = 'auto'

    const handleScroll = () => ScrollTrigger.update()
    lenis.on('scroll', handleScroll)

    const tick = (time: number) => {
      lenis.raf(time * 1000)
    }
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)

    let refreshFrame = 0
    const refresh = () => {
      window.cancelAnimationFrame(refreshFrame)
      refreshFrame = window.requestAnimationFrame(() => ScrollTrigger.refresh())
    }

    if (document.fonts) {
      document.fonts.ready.then(refresh).catch(() => undefined)
    }
    window.addEventListener('load', refresh)

    const handleAnchorClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.detail === 0
      ) {
        return
      }

      const anchor = (event.target as Element | null)?.closest?.(
        'a[href]',
      ) as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute('href')
      if (!href || href === '#' || href === '#main-content') return

      const onThisPage = href.startsWith('#')
      const onHomePage = href.startsWith(`${pathname}#`)
      if (!onThisPage && !onHomePage) return

      const id = decodeURIComponent(href.slice(href.indexOf('#') + 1))
      const target = document.getElementById(id)
      if (!target) return

      event.preventDefault()
      // Lenis already honours the root `scroll-padding-top`, so no extra
      // offset is needed here — adding one would double the header clearance.
      lenis.scrollTo(target, {
        duration: 1.15,
        easing: (t: number) => 1 - Math.pow(1 - t, 3),
      })

      if (onThisPage) {
        window.history.pushState(null, '', href)
      }
    }

    document.addEventListener('click', handleAnchorClick)
    window.addEventListener('resize', refresh)
    refresh()

    return () => {
      document.removeEventListener('click', handleAnchorClick)
      window.removeEventListener('load', refresh)
      window.removeEventListener('resize', refresh)
      window.cancelAnimationFrame(refreshFrame)
      lenis.off('scroll', handleScroll)
      gsap.ticker.remove(tick)
      lenis.destroy()
      lenisRef.current = null
      root.classList.remove('smooth-scroll-active')
      root.style.scrollBehavior = previousScrollBehavior
      ScrollTrigger.refresh()
    }
  }, [pathname])

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => ScrollTrigger.refresh())
    return () => window.cancelAnimationFrame(frame)
  }, [pathname])

  return null
}
