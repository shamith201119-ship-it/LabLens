import {
  CircleCheck,
  CircleX,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { SectionHeading } from '../SectionHeading'
import { Reveal } from '../motion'
import { SectionRule } from './SectionRule'

const does = [
  'Explain measurements in plain, referenced language.',
  'Keep the original document and its printed ranges visible.',
  'Help you form questions for a qualified healthcare professional.',
  'Make uncertainty, context and limitations explicit.',
]

const doesNot = [
  'Diagnose a condition or replace medical advice.',
  'Recommend treatment, medication or supplements.',
  'Declare a result normal or abnormal on its own.',
  'Hide its sources or invent missing information.',
]

const boundaryTicker = [
  'Educational context',
  'Not a diagnosis',
  'No treatment advice',
  'No risk scores',
  'Clinician in the loop',
  'Sources stay visible',
]

export function Safety() {
  const marqueeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const band = marqueeRef.current
    if (!band) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        band.classList.toggle('is-offscreen', !entries[0]?.isIntersecting)
      },
      { rootMargin: '120px 0px' },
    )

    observer.observe(band)
    return () => observer.disconnect()
  }, [])

  return (
    <section
      className="landing-section landing-section--dark on-dark"
      id="safety"
      aria-labelledby="safety-title"
    >
      <div className="landing-container">
        <SectionRule tone="dark" />
        <Reveal>
          <div className="safety__head">
            <SectionHeading
              eyebrow="Safety & boundaries"
              title="Clear about what LabLens is — and is not."
              id="safety-title"
              dark
            />
            <p className="safety__head-note">
              Health tools earn trust by stating their limits. These boundaries
              are part of the product, not a footnote added at the end.
            </p>
          </div>
        </Reveal>

        <div className="safety__grid">
          <Reveal>
            <div className="safety__card safety__card--does">
              <div className="safety__card-head">
                <span className="safety__card-icon" aria-hidden="true">
                  <ShieldCheck size={15} strokeWidth={2} />
                </span>
                <h3>What LabLens aims to do</h3>
              </div>
              <ul className="safety-list">
                {does.map((item) => (
                  <li key={item}>
                    <CircleCheck
                      size={14}
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="safety__card safety__card--does-not">
              <div className="safety__card-head">
                <span className="safety__card-icon" aria-hidden="true">
                  <CircleX size={15} strokeWidth={2} />
                </span>
                <h3>What LabLens will never do</h3>
              </div>
              <ul className="safety-list">
                {doesNot.map((item) => (
                  <li key={item}>
                    <CircleX size={14} strokeWidth={2} aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <Reveal>
          <div className="safety__disclaimer">
            <span className="safety__disclaimer-icon" aria-hidden="true">
              <ShieldAlert size={15} strokeWidth={2} />
            </span>
            <p>
              <strong>A note on urgency</strong>
              LabLens is not an emergency service. If you have severe symptoms
              or believe you need urgent care, contact local emergency services
              or your clinician directly. Do not wait for an explanation in an
              app.
            </p>
          </div>
        </Reveal>
      </div>

      <div
        className="safety-marquee"
        aria-label="Non-negotiable boundaries"
        ref={marqueeRef}
      >
        <div className="safety-marquee__track">
          {[0, 1].map((copy) => (
            <div
              className="safety-marquee__group"
              key={copy}
              aria-hidden={copy === 1 ? 'true' : undefined}
            >
              {boundaryTicker.map((item) => (
                <span className="safety-marquee__item" key={`${copy}-${item}`}>
                  {item}
                  <span className="safety-marquee__dot" aria-hidden="true" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
