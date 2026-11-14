import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { gsap } from 'gsap'
import { usePageTitle } from '../lib/usePageTitle'
import { prefersReducedMotion } from '../lib/motionEnvironment'
import { useAppReady } from '../context/appReadiness'
import { LandingHeader } from '../components/landing/LandingHeader'
import { Hero } from '../components/landing/Hero'
import { TrustStrip } from '../components/landing/TrustStrip'
import { Problem } from '../components/landing/Problem'
import { ReaderMarquee } from '../components/landing/ReaderMarquee'
import { HowItWorks } from '../components/landing/HowItWorks'
import { TranslationLayer } from '../components/landing/TranslationLayer'
import { Capabilities } from '../components/landing/Capabilities'
import { Understanding } from '../components/landing/Understanding'
import { Timeline } from '../components/landing/Timeline'
import { Preparation } from '../components/landing/Preparation'
import { Safety } from '../components/landing/Safety'
import { Manifesto } from '../components/landing/Manifesto'
import { FinalCta } from '../components/landing/FinalCta'
import { Footer } from '../components/landing/Footer'
import { SmoothScroll } from '../components/landing/SmoothScroll'
import { ScrollProgress } from '../components/landing/ScrollProgress'


gsap.registerPlugin(ScrollTrigger)

export function LandingPage() {
  usePageTitle('LabLens — Your lab report, in plain language')
  const pageRef = useRef<HTMLDivElement>(null)
  const ready = useAppReady()

  useGSAP(
    () => {
      if (!ready || prefersReducedMotion()) return

      const rules = gsap.utils.toArray<HTMLElement>('[data-section-rule]')
      rules.forEach((rule) => {
        const dot = rule.querySelector<HTMLElement>('.section-rule__dot')

        gsap.fromTo(
          rule,
          { scaleX: 0, autoAlpha: 0.3 },
          {
            scaleX: 1,
            autoAlpha: 1,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: rule,
              start: 'top 94%',
              once: true,
            },
          },
        )

        if (dot) {
          gsap.fromTo(
            dot,
            { scale: 0 },
            {
              scale: 1,
              duration: 0.5,
              delay: 0.35,
              ease: 'back.out(2.4)',
              scrollTrigger: {
                trigger: rule,
                start: 'top 94%',
                once: true,
              },
            },
          )
        }
      })
    },
    { scope: pageRef, dependencies: [ready] },
  )

  return (
    <div className="landing" ref={pageRef}>
      <SmoothScroll />
      <ScrollProgress />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <LandingHeader />

      <main id="main-content" tabIndex={-1}>
        <Hero />
        <TrustStrip />
        <Problem />
        <ReaderMarquee />
        <HowItWorks />
        <TranslationLayer />
        <Capabilities />
        <Understanding />
        <Timeline />
        <Preparation />
        <Safety />
        <Manifesto />
        <FinalCta />
      </main>

      <Footer />
    </div>
  )
}
