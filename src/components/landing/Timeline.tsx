import { useRef } from 'react'
import { CalendarClock, Check, Info } from 'lucide-react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SectionHeading } from '../SectionHeading'
import { StatusBadge } from '../StatusBadge'
import { Reveal } from '../motion'
import { prefersReducedMotion } from '../../lib/motionEnvironment'

gsap.registerPlugin(ScrollTrigger)

const points = [
  'Values are compared only when the laboratory method is comparable.',
  'Changes are described as observations, never as improvement or decline.',
  'Your clinician interprets any trend alongside your history and examination.',
]

const nodes = [
  {
    step: 'Baseline · sample A',
    title: '24 ng/mL',
    description: 'Synthetic report A, same laboratory method.',
  },
  {
    step: 'Follow-up · sample B',
    title: '29 ng/mL',
    description: 'Synthetic report B, comparable range.',
  },
  {
    step: 'Next conversation',
    title: 'Questions, not conclusions',
    description: 'Bring the sequence to a qualified professional.',
  },
]

export function Timeline() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const section = root.current
      if (!section || prefersReducedMotion()) return

      const q = gsap.utils.selector(section)
      const spark = q<HTMLElement>('.timeline-spark')[0]
      if (!spark) return

      gsap.fromTo(
        q<SVGPathElement>('.timeline-spark__path'),
        { strokeDashoffset: 1 },
        {
          strokeDashoffset: 0,
          duration: 1.3,
          ease: 'power2.inOut',
          scrollTrigger: { trigger: spark, start: 'top 86%', once: true },
        },
      )

      gsap.fromTo(
        q<SVGCircleElement>('.timeline-spark__dot'),
        { scale: 0, transformOrigin: 'center' },
        {
          scale: 1,
          duration: 0.5,
          stagger: 0.18,
          delay: 0.35,
          ease: 'back.out(2)',
          scrollTrigger: { trigger: spark, start: 'top 86%', once: true },
        },
      )

      gsap.fromTo(
        q<SVGTextElement>('.timeline-spark__label'),
        { autoAlpha: 0 },
        {
          autoAlpha: 1,
          duration: 0.5,
          stagger: 0.12,
          delay: 0.2,
          scrollTrigger: { trigger: spark, start: 'top 86%', once: true },
        },
      )

      gsap.fromTo(
        q<HTMLElement>('.timeline-track__line'),
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.9,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: q<HTMLElement>('.timeline-track')[0],
            start: 'top 90%',
            once: true,
          },
        },
      )

      gsap.fromTo(
        q<HTMLElement>('.timeline-node__dot'),
        { scale: 0 },
        {
          scale: 1,
          duration: 0.45,
          stagger: 0.12,
          ease: 'back.out(2)',
          scrollTrigger: {
            trigger: q<HTMLElement>('.timeline-track')[0],
            start: 'top 90%',
            once: true,
          },
        },
      )

      gsap.fromTo(
        q<HTMLElement>('.timeline-points__line'),
        { scaleY: 0 },
        {
          scaleY: 1,
          duration: 1.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: q<HTMLElement>('.timeline-points')[0],
            start: 'top 88%',
            once: true,
          },
        },
      )
    },
    { scope: root },
  )

  return (
    <section className="landing-section timeline-section" id="timeline" ref={root}>
      <div className="landing-container">
        <Reveal>
          <div className="timeline-panel">
            <div className="timeline-panel__copy">
              <SectionHeading
                eyebrow="What changes over time"
                title="One report is a snapshot. Trends need context."
                description="LabLens will help you look across reports without hiding the dates, methods and range changes that give a comparison its meaning."
              />
              <div className="timeline-points">
                <span className="timeline-points__line" aria-hidden="true" />
                {points.map((point) => (
                  <p className="timeline-point" key={point}>
                    <Check size={13} strokeWidth={2.2} aria-hidden="true" />
                    <span>{point}</span>
                  </p>
                ))}
              </div>
            </div>

            <div className="timeline-visual" aria-hidden="true">
              <div className="timeline-visual__head">
                <span className="timeline-visual__label">
                  Sample measurement timeline
                </span>
                <StatusBadge variant="lime" dot={false}>
                  Illustrative
                </StatusBadge>
              </div>

              <div className="timeline-spark" aria-hidden="true">
                <div className="timeline-spark__head">
                  <span>Sample sequence · same method</span>
                  <span>ng/mL</span>
                </div>
                <svg viewBox="0 0 420 96" className="timeline-spark__svg">
                  <line
                    className="timeline-spark__range"
                    x1="24"
                    y1="26"
                    x2="396"
                    y2="26"
                  />
                  <text className="timeline-spark__label" x="396" y="18" textAnchor="end">
                    30 · printed lower bound
                  </text>
                  <line
                    className="timeline-spark__baseline"
                    x1="24"
                    y1="82"
                    x2="396"
                    y2="82"
                  />
                  <path
                    className="timeline-spark__path"
                    d="M 92 62 L 300 46"
                    pathLength={1}
                  />
                  <circle
                    className="timeline-spark__dot"
                    cx="92"
                    cy="62"
                    r="5"
                  />
                  <circle
                    className="timeline-spark__dot timeline-spark__dot--b"
                    cx="300"
                    cy="46"
                    r="5"
                  />
                  <text className="timeline-spark__label" x="92" y="52" textAnchor="middle">
                    24
                  </text>
                  <text className="timeline-spark__label" x="300" y="36" textAnchor="middle">
                    29
                  </text>
                  <text className="timeline-spark__label" x="92" y="94" textAnchor="middle">
                    SAMPLE A
                  </text>
                  <text className="timeline-spark__label" x="300" y="94" textAnchor="middle">
                    SAMPLE B
                  </text>
                </svg>
                <p className="timeline-spark__note">
                  <CalendarClock size={9} />
                  Comparable method · illustrated values, not a real trend
                </p>
              </div>

              <div className="timeline-track">
                <span className="timeline-track__line" aria-hidden="true" />
                {nodes.map((node) => (
                  <div className="timeline-node" key={node.step}>
                    <span className="timeline-node__dot" />
                    <span className="timeline-node__step">{node.step}</span>
                    <h3>{node.title}</h3>
                    <p>{node.description}</p>
                  </div>
                ))}
              </div>

              <div className="timeline-visual__detail">
                <div className="timeline-chips">
                  <span className="timeline-chip">
                    <CalendarClock size={8} />
                    Same method
                  </span>
                  <span className="timeline-chip">Comparable range</span>
                  <span className="timeline-chip">Synthetic</span>
                </div>
                <span className="timeline-visual__foot">
                  Illustrative sequence
                  <br />
                  not a real trend
                </span>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal>
          <p className="steps__note">
            <Info size={13} aria-hidden="true" />
            Trend comparisons above build from your own verified results.
            The values shown are illustrative and demonstrate layout only.
          </p>
        </Reveal>
      </div>
    </section>
  )
}
