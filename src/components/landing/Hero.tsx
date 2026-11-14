import { useRef } from 'react'
import { ArrowRight, ChevronDown, ShieldCheck } from 'lucide-react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ButtonLink } from '../Button'
import { hasFinePointer, prefersReducedMotion } from '../../lib/motionEnvironment'
import { useAppReady } from '../../context/appReadiness'

export function Hero() {
  const root = useRef<HTMLElement>(null)
  const primary = useRef<HTMLAnchorElement>(null)
  const spotlight = useRef<HTMLDivElement>(null)
  const ready = useAppReady()

  useGSAP(
    () => {
      const rootElement = root.current
      if (!ready || !rootElement || prefersReducedMotion()) return

      const q = gsap.utils.selector(rootElement)
      const lines = q('.hero__line-inner')
      const fades = q('.hero__fade')
      const rawCard = q('.hero-card--raw')[0] as HTMLElement | undefined
      const arrow = q('.hero-arrow')[0] as HTMLElement | undefined
      const plainCard = q('.hero-card--plain')[0] as HTMLElement | undefined
      const plainWords = q('.hero-card--plain p span')

      gsap.set(lines, { yPercent: 118, rotate: 1.4 })
      gsap.set(fades, { autoAlpha: 0, y: 16 })
      if (rawCard) gsap.set(rawCard, { autoAlpha: 0, x: 28, rotation: 0, scale: 0.98 })
      if (arrow) gsap.set(arrow, { autoAlpha: 0 })
      if (plainCard) gsap.set(plainCard, { autoAlpha: 0, x: -22, rotation: 0, scale: 0.98 })
      if (plainWords.length) gsap.set(plainWords, { autoAlpha: 0, y: 8 })

      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } })
      timeline
        .to(lines, { yPercent: 0, rotate: 0, duration: 0.9, stagger: 0.07 })
        .to(fades, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06 }, '-=0.45')
        .to(rawCard as HTMLElement, { autoAlpha: 1, x: -4, rotation: -1.8, scale: 1, duration: 0.7 }, '-=0.35')
        .to(arrow as HTMLElement, { autoAlpha: 1, duration: 0.45, ease: 'power2.out' }, '-=0.25')
        .to(plainCard as HTMLElement, { autoAlpha: 1, x: 6, rotation: 1.4, scale: 1, duration: 0.7 }, '-=0.2')
        .to(plainWords, { autoAlpha: 1, y: 0, duration: 0.45, stagger: 0.025 }, '-=0.45')

      const cleanups: Array<() => void> = []

      if (hasFinePointer()) {
        const spot = spotlight.current
        const btn = primary.current as HTMLElement | null

        let raf = 0
        let sx = 0
        let sy = 0

        const updateSpot = () => {
          raf = 0
          if (spot) spot.style.transform = `translate3d(${sx - 180}px, ${sy - 180}px, 0)`
        }

        const handleRootMove = (event: PointerEvent) => {
          const rect = rootElement.getBoundingClientRect()
          sx = event.clientX - rect.left
          sy = event.clientY - rect.top
          if (!raf) raf = requestAnimationFrame(updateSpot)

          if (btn) {
            const b = btn.getBoundingClientRect()
            const cx = b.left + b.width / 2 - rect.left
            const cy = b.top + b.height / 2 - rect.top
            const dx = sx - cx
            const dy = sy - cy
            const dist = Math.hypot(dx, dy)
            if (dist < 150) {
              const pull = (1 - dist / 150) * 9
              const tx = (dx / (dist || 1)) * pull
              const ty = (dy / (dist || 1)) * pull
              btn.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0)`
            } else {
              btn.style.transform = 'translate3d(0,0,0)'
            }
          }
        }

        const handleRootLeave = () => {
          if (btn) btn.style.transform = 'translate3d(0,0,0)'
        }

        rootElement.addEventListener('pointermove', handleRootMove, { passive: true })
        rootElement.addEventListener('pointerleave', handleRootLeave)
        cleanups.push(() => {
          rootElement.removeEventListener('pointermove', handleRootMove)
          rootElement.removeEventListener('pointerleave', handleRootLeave)
          if (raf) cancelAnimationFrame(raf)
        })
      }

      return () => {
        cleanups.forEach((cleanup) => cleanup())
      }
    },
    { scope: root, dependencies: [ready] },
  )

  return (
    <section className="hero" id="top" ref={root} aria-labelledby="hero-title">
      <div className="hero__ambient" aria-hidden="true" />
      <div className="hero__spotlight" ref={spotlight} aria-hidden="true" />

      <div className="landing-container hero__inner">
        <div className="hero__content">
          <div className="hero__fade">
            <span className="hero__eyebrow">
              <span className="hero__eyebrow-dot" aria-hidden="true" />
              A clearer way to read your health data
            </span>
          </div>

          <h1 id="hero-title" className="hero__title">
            <span className="hero__line">
              <span className="hero__line-inner">Your lab report.</span>
            </span>{' '}
            <span className="hero__line">
              <span className="hero__line-inner">Finally, in</span>
            </span>{' '}
            <span className="hero__line">
              <span className="hero__line-inner">
                <span className="hero__highlight">plain language.</span>
              </span>
            </span>
          </h1>

          <p className="hero__description hero__fade">
            Understand your test results, explore what they may mean, and
            prepare for more informed conversations with your doctor.
          </p>

          <div className="hero__actions hero__fade">
            <ButtonLink to="/app/start" variant="primary" size="lg" ref={primary}>
              Explore LabLens
              <ArrowRight size={16} className="btn__arrow" aria-hidden="true" />
            </ButtonLink>
            <a className="btn btn--secondary btn--lg" href="#how-it-works">
              See how it works
              <ChevronDown size={15} aria-hidden="true" />
            </a>
          </div>

          <div className="hero__assurance hero__fade">
            <ShieldCheck size={14} aria-hidden="true" />
            <span>
              <strong>A health-literacy tool, not a diagnosis.</strong> Reports are
              processed locally on this machine; your documents never leave it.
            </span>
          </div>
        </div>

        <div className="hero__cards" aria-label="Demonstration: a printed measurement becomes a plain sentence">
          <div className="hero-card hero-card--raw">
            <span className="hero-card__label">01 · As printed</span>
            <span className="hero-card__name">Vitamin D (25-OH)</span>
            <span className="hero-card__value num">24</span>
            <span className="hero-card__unit">ng/mL</span>
            <span className="hero-card__range">range 30 – 100</span>
            <span className="hero-card__flag">LOW</span>
          </div>

          <svg className="hero-arrow" viewBox="0 0 64 104" aria-hidden="true">
            <path
              className="hero-arrow__path"
              d="M 32 4 C 58 18, 58 38, 32 42 C 6 46, 6 22, 32 26 C 58 30, 58 54, 32 84"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              className="hero-arrow__head"
              d="M 26 84 L 32 95 L 38 84 z"
              fill="currentColor"
              stroke="none"
            />
          </svg>

          <div className="hero-card hero-card--plain">
            <span className="hero-card__label">02 · In plain language</span>
            <h3 className="hero-card__title">One low value, read with care.</h3>
            <p>
              {'Your vitamin D is below the usual range. It supports calcium absorption and bone strength, so it is worth discussing with your clinician.'
                .split(' ')
                .map((word, index) => (
                  <span key={`${word}-${index}`}>{word} </span>
                ))}
            </p>
            <span className="hero-card__source">
              <ShieldCheck size={10} aria-hidden="true" />
              Educational context, not a diagnosis
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}