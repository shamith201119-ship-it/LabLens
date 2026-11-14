import { useRef } from 'react'
import {
  ArrowRight,
  BookOpenCheck,
  GitBranch,
  MessageSquareText,
  Sparkles,
  Stethoscope,
  Waypoints,
} from 'lucide-react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SectionHeading } from '../SectionHeading'
import { Reveal } from '../motion'
import {
  hasFinePointer,
  prefersReducedMotion,
} from '../../lib/motionEnvironment'
import { SectionRule } from './SectionRule'

gsap.registerPlugin(ScrollTrigger)

const threadSteps = [
  { step: '01', title: 'Document', note: 'The source stays attached.' },
  { step: '02', title: 'Measurements', note: 'Values, units and flags are preserved.' },
  { step: '03', title: 'Context', note: 'Plain language is kept separate.' },
  { step: '04', title: 'Questions', note: 'You leave with something to discuss.' },
]

export function Capabilities() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const section = root.current
      if (!section) return

      const q = gsap.utils.selector(section)

      if (!prefersReducedMotion()) {
        gsap.fromTo(
          q<HTMLElement>('.capability-thread__line'),
          { scaleX: 0 },
          {
            scaleX: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: q<HTMLElement>('.capability-thread')[0],
              start: 'top 88%',
              end: 'top 42%',
              scrub: 0.5,
            },
          },
        )

        gsap.fromTo(
          q<HTMLElement>('.capability-thread__node'),
          { autoAlpha: 0, y: 14 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.55,
            stagger: 0.12,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: q<HTMLElement>('.capability-thread')[0],
              start: 'top 82%',
              once: true,
            },
          },
        )
      }

      if (!hasFinePointer()) return undefined

      const grid = q<HTMLElement>('.product-grid')[0]
      if (!grid) return undefined

      const onPointerMove = (event: PointerEvent) => {
        const card = (event.target as HTMLElement).closest<HTMLElement>(
          '.product-feature',
        )
        if (!card) return

        const rect = card.getBoundingClientRect()
        card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
        card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
      }

      grid.addEventListener('pointermove', onPointerMove, { passive: true })

      return () => {
        grid.removeEventListener('pointermove', onPointerMove)
      }
    },
    { scope: root },
  )

  return (
    <section
      className="landing-section landing-section--dark on-dark product-section"
      id="product"
      aria-labelledby="product-title"
      ref={root}
    >
      <div className="landing-container">
        <SectionRule tone="dark" />

        <Reveal>
          <div className="section-head section-head--dark product-section__head">
            <SectionHeading
              eyebrow="The product"
              title="Built for understanding, not speculation."
              id="product-title"
              dark
            />
            <div className="section-head__aside">
              <p>
                Every screen keeps the source visible, the language plain and
                the limits of the report clear.
              </p>
              <p>Interface concepts · synthetic measurements.</p>
            </div>
          </div>
        </Reveal>

        <div className="product-grid">
          <Reveal className="product-feature product-feature--analysis">
            <span className="product-feature__ghost num" aria-hidden="true">
              01
            </span>
            <div className="product-feature__head">
              <span className="product-feature__icon" aria-hidden="true">
                <Sparkles size={16} strokeWidth={1.8} />
              </span>
              
            </div>
            <div className="product-feature__copy">
              <h3>Measurements, kept in context</h3>
              <p>
                Values sit beside their units, the reference range printed on
                the report and the laboratory&apos;s own flag. Nothing is read
                in isolation.
              </p>
            </div>

            <div className="product-analysis" aria-hidden="true">
              <div className="product-analysis__top">
                <span>Vitamin D (25-OH)</span>
                <span className="product-pill product-pill--amber">
                  Below range · sample
                </span>
              </div>
              <div className="product-analysis__value num">
                24 <small>ng/mL</small>
              </div>
              <div className="product-analysis__bar">
                <span className="product-analysis__band" />
                <span className="product-analysis__marker" />
                <span className="product-analysis__label">24</span>
                <span className="product-analysis__label product-analysis__label--low">
                  30
                </span>
                <span className="product-analysis__label product-analysis__label--high">
                  100
                </span>
              </div>
              <div className="product-analysis__plain">
                <BookOpenCheck size={11} aria-hidden="true" />
                Supports calcium absorption and bone and muscle function.
              </div>
              <div className="product-analysis__source">
                <Waypoints size={9} aria-hidden="true" />
                Source attached · educational context, not a diagnosis
              </div>
            </div>
          </Reveal>

          <Reveal className="product-feature product-feature--evidence" delay={0.06}>
            <span className="product-feature__ghost num" aria-hidden="true">
              02
            </span>
            <div className="product-feature__head">
              <span className="product-feature__icon" aria-hidden="true">
                <BookOpenCheck size={16} strokeWidth={1.8} />
              </span>
              
            </div>
            <div className="product-feature__copy">
              <h3>Explanations you can trace</h3>
              <p>
                Plain-language context is separated from interpretation, with
                the supporting reference attached to every claim.
              </p>
            </div>

            <div className="evidence-thread" aria-hidden="true">
              <div className="evidence-thread__item">
                <span className="evidence-thread__dot" />
                <div>
                  <strong>What this measures</strong>
                  <small>Physiology, in one clear sentence</small>
                </div>
                <span className="evidence-thread__num">01</span>
              </div>
              <div className="evidence-thread__item">
                <span className="evidence-thread__dot" />
                <div>
                  <strong>How to read the range</strong>
                  <small>What the printed reference can tell you</small>
                </div>
                <span className="evidence-thread__num">02</span>
              </div>
              <div className="evidence-thread__item">
                <span className="evidence-thread__dot" />
                <div>
                  <strong>What it cannot say</strong>
                  <small>Limits, context and uncertainty</small>
                </div>
                <span className="evidence-thread__num">03</span>
              </div>
              <p className="evidence-thread__foot">
                Each explanation keeps its source within reach.
              </p>
            </div>
          </Reveal>

          <Reveal className="product-feature product-feature--history" delay={0.1}>
            <span className="product-feature__ghost num" aria-hidden="true">
              03
            </span>
            <div className="product-feature__head">
              <span className="product-feature__icon" aria-hidden="true">
                <GitBranch size={16} strokeWidth={1.8} />
              </span>
              
            </div>
            <div className="product-feature__copy">
              <h3>Patterns, not conclusions</h3>
              <p>
                Measurements can be read together when there is a clinical
                reason to do so — with the uncertainty left intact.
              </p>
            </div>

            <div className="product-history" aria-hidden="true">
              <div className="product-history__row">
                <span className="product-history__date">Jun 2025</span>
                <span className="product-history__value num">24</span>
                <span className="product-history__method">Same method</span>
              </div>
              <div className="product-history__track">
                <span className="product-history__line" />
                <span className="product-history__point product-history__point--one" />
                <span className="product-history__point product-history__point--two" />
              </div>
              <div className="product-history__row">
                <span className="product-history__date">Mar 2026</span>
                <span className="product-history__value num">29</span>
                <span className="product-history__method">Comparable range</span>
              </div>
              <p className="product-history__note">
                Illustrative sequence · observations, not improvement or decline.
              </p>
            </div>
          </Reveal>

          <Reveal className="product-feature product-feature--followup" delay={0.14}>
            <span className="product-feature__ghost num" aria-hidden="true">
              04
            </span>
            <div className="product-feature__head">
              <span className="product-feature__icon" aria-hidden="true">
                <MessageSquareText size={16} strokeWidth={1.8} />
              </span>
              
            </div>
            <div className="product-feature__copy">
              <h3>Questions worth asking</h3>
              <p>
                A short, printable brief of what you noticed and what you want
                to discuss — written by you, informed by the report.
              </p>
            </div>

            <div className="product-brief" aria-hidden="true">
              <div className="product-brief__head">
                <Stethoscope size={11} aria-hidden="true" />
                Appointment brief · sample
              </div>
              <ol className="product-brief__list">
                <li>
                  <span>01</span>
                  Which result matters most for me, and why?
                </li>
                <li>
                  <span>02</span>
                  Could my medication affect this value?
                </li>
                <li>
                  <span>03</span>
                  Does anything need to be rechecked, and when?
                </li>
              </ol>
              <div className="product-brief__foot">
                Prepared, not prescribed
                <ArrowRight size={10} aria-hidden="true" />
              </div>
            </div>
          </Reveal>
        </div>

        <div className="capability-thread">
          <div className="capability-thread__meta">
            <span>One continuous thread</span>
            <span className="num">04 steps</span>
          </div>
          <div className="capability-thread__track">
            <span className="capability-thread__line" aria-hidden="true" />
            {threadSteps.map((item) => (
              <div className="capability-thread__node" key={item.step}>
                <span className="capability-thread__dot" aria-hidden="true" />
                <span className="capability-thread__step num">{item.step}</span>
                <h3>{item.title}</h3>
                <p>{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
