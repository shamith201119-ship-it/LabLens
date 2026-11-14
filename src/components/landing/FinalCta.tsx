import { useRef } from 'react'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ButtonLink } from '../Button'
import { Reveal } from '../motion'
import { prefersReducedMotion } from '../../lib/motionEnvironment'

gsap.registerPlugin(ScrollTrigger)

const steps = [
  { number: '01', label: 'Understand the value' },
  { number: '02', label: 'Prepare the question' },
  { number: '03', label: 'Discuss with a clinician' },
]

export function FinalCta() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const section = root.current
      if (!section || prefersReducedMotion()) return

      const q = gsap.utils.selector(section)
      const panel = q<HTMLElement>('.cta-panel')[0]
      if (!panel) return

      gsap.fromTo(
        panel,
        {
          clipPath: 'inset(10% 4% 10% 4% round 28px)',
          scale: 0.988,
        },
        {
          clipPath: 'inset(0% 0% 0% 0% round 28px)',
          scale: 1,
          duration: 1.05,
          ease: 'power3.out',
          scrollTrigger: { trigger: panel, start: 'top 84%', once: true },
        },
      )

      gsap.fromTo(
        q<HTMLElement>('.cta-panel__steps li'),
        { autoAlpha: 0, y: 10 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.1,
          ease: 'power3.out',
          scrollTrigger: { trigger: panel, start: 'top 78%', once: true },
        },
      )
    },
    { scope: root },
  )

  return (
    <section className="cta-section" aria-labelledby="cta-title" ref={root}>
      <div className="landing-container">
        <Reveal>
          <div className="cta-panel">
            <div className="cta-panel__copy">
              <span className="cta-panel__kicker">Local &amp; private</span>
              <h2 id="cta-title">See LabLens on your own report.</h2>
              <p>
                Upload a lab report, verify what LabLens read from it, and
                carry clearer questions into your next clinician
                conversation. Nothing leaves this machine.
              </p>

              <ol className="cta-panel__steps">
                {steps.map((step) => (
                  <li key={step.number}>
                    <span className="num" aria-hidden="true">
                      {step.number}
                    </span>
                    {step.label}
                  </li>
                ))}
              </ol>
            </div>

            <div className="cta-panel__side">
              <div className="cta-panel__actions">
                <ButtonLink to="/app/start" variant="dark" size="lg">
                  Open the workspace
                  <ArrowRight
                    size={16}
                    className="btn__arrow"
                    aria-hidden="true"
                  />
                </ButtonLink>
                <a className="btn btn--ghost btn--lg" href="#safety">
                  Review safety
                </a>
              </div>
              <p className="cta-panel__note">
                <ShieldCheck size={11} aria-hidden="true" />
                Your report is processed on this device. No uploads are
                transmitted and nothing is stored elsewhere.
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
