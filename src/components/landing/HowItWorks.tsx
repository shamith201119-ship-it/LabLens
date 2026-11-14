import { useRef, useState } from 'react'
import {
  BookOpenText,
  Check,
  FileText,
  Info,
  ScanLine,
  Sparkles,
  Stethoscope,
  Table2,
} from 'lucide-react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SectionHeading } from '../SectionHeading'
import { StatusBadge } from '../StatusBadge'
import { prefersReducedMotion } from '../../lib/motionEnvironment'
import { SectionRule } from './SectionRule'

gsap.registerPlugin(ScrollTrigger)

const stages = [
  {
    number: '01',
    icon: FileText,
    title: 'Start with the raw document',
    description:
      'A laboratory report is written for clinical readers: abbreviations, printed ranges and flags. The original document stays in view.',
    label: 'Raw report',
  },
  {
    number: '02',
    icon: Table2,
    title: 'Separate the measurements',
    description:
      'Selected results become clean rows — value, unit, printed reference range and the laboratory’s own flag, without invented numbers.',
    label: 'Structured measurements',
  },
  {
    number: '03',
    icon: Sparkles,
    title: 'Add plain-language context',
    description:
      'Each measurement gains an explanation of what it measures and what it cannot tell you. Interpretation is not presented as fact.',
    label: 'Understanding',
  },
  {
    number: '04',
    icon: BookOpenText,
    title: 'Keep the evidence attached',
    description:
      'Explanations stay connected to the original document, the printed range and the wider context that a single value cannot contain.',
    label: 'Context & evidence',
  },
  {
    number: '05',
    icon: Stethoscope,
    title: 'Leave with better questions',
    description:
      'The result is not a verdict. It is a short brief of what you noticed and what you want to discuss with a qualified clinician.',
    label: 'Informed follow-up',
  },
]

const rawRows = [
  { name: 'Hb', value: '13.8', ref: '12.0–15.5', flag: 'N' },
  { name: '25-OH Vit D', value: '24', ref: '30–100', flag: 'L' },
  { name: 'Ferritin', value: '18', ref: '15–150', flag: 'N' },
  { name: 'TSH', value: '1.8', ref: '0.4–4.0', flag: 'N' },
  { name: 'eGFR', value: '94', ref: '> 60', flag: 'N' },
]

const measurements = [
  {
    name: 'Vitamin D (25-OH)',
    value: '24',
    unit: 'ng/mL',
    reference: '30–100',
    position: 24,
    low: 30,
    high: 100,
    flag: 'Below printed range',
    tone: 'amber',
  },
  {
    name: 'Ferritin',
    value: '18',
    unit: 'ng/mL',
    reference: '15–150',
    position: 12,
    low: 9.4,
    high: 93.8,
    flag: 'Within printed range',
    tone: 'mint',
  },
  {
    name: 'TSH',
    value: '1.8',
    unit: 'mIU/L',
    reference: '0.4–4.0',
    position: 45,
    low: 10,
    high: 100,
    flag: 'Within printed range',
    tone: 'mint',
  },
]

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const visualRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef(0)
  const [activeStage, setActiveStage] = useState(0)

  useGSAP(
    () => {
      const section = sectionRef.current
      const pin = pinRef.current
      const visual = visualRef.current
      if (!section || !pin || !visual || prefersReducedMotion()) return

      const media = gsap.matchMedia()

      media.add('(min-width: 1024px)', () => {
        section.classList.add('is-pinned')

        const q = gsap.utils.selector(visual)
        const panels = q('.story-panel') as HTMLElement[]
        const rawRowsNodes = q('.story-raw-row')
        const bands = q('.story-bar__band')
        const markers = q('.story-bar__marker')
        const explainRows = q('.story-understanding__row')
        const evidencePath = q('.story-evidence__path')
        const followupItems = q('.story-followup__item')

        gsap.set(panels, { autoAlpha: 0, y: 22 })
        gsap.set(panels[0], { autoAlpha: 1, y: 0 })
        gsap.set(evidencePath, { strokeDashoffset: 1 })

        const timeline = gsap.timeline({
          defaults: { ease: 'power2.out' },
          scrollTrigger: {
            trigger: pin,
            start: 'top 96px',
            end: '+=3100',
            pin: true,
            scrub: 0.65,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const index = Math.min(
                stages.length - 1,
                Math.floor(self.progress * stages.length),
              )
              if (index !== activeRef.current) {
                activeRef.current = index
                setActiveStage(index)
              }
            },
          },
        })

        const crossfade = (index: number) => {
          const previous = panels[index - 1]
          const next = panels[index]
          // Overlap the two panels so the stage never passes through a blank
          // frame. The outgoing panel fades out while the incoming one fades
          // in across the same short window.
          timeline.to(
            previous,
            { autoAlpha: 0, y: -14, duration: 0.24, ease: 'power1.inOut' },
            index - 0.22,
          )
          timeline.fromTo(
            next,
            { autoAlpha: 0, y: 14 },
            { autoAlpha: 1, y: 0, duration: 0.24, ease: 'power1.inOut' },
            index - 0.12,
          )
        }

        // The first panel is already visible before the pin engages, so the
        // rows must never start at zero opacity. A short settle is enough.
        timeline.fromTo(
          rawRowsNodes,
          { x: -6 },
          {
            x: 0,
            duration: 0.5,
            stagger: 0.08,
          },
          0.1,
        )

        crossfade(1)
        timeline.fromTo(
          bands,
          { scaleX: 0 },
          {
            scaleX: 1,
            duration: 0.5,
            stagger: 0.08,
            transformOrigin: 'left center',
          },
          1.12,
        )
        timeline.fromTo(
          markers,
          { autoAlpha: 0, scale: 0.6 },
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.38,
            stagger: 0.08,
          },
          1.24,
        )

        crossfade(2)
        timeline.fromTo(
          explainRows,
          { autoAlpha: 0, y: 10 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.38,
            stagger: 0.1,
          },
          2.1,
        )

        crossfade(3)
        timeline.to(
          evidencePath,
          { strokeDashoffset: 0, duration: 0.72 },
          3.08,
        )

        crossfade(4)
        timeline.fromTo(
          followupItems,
          { autoAlpha: 0, x: -8 },
          {
            autoAlpha: 1,
            x: 0,
            duration: 0.38,
            stagger: 0.1,
          },
          4.12,
        )

        // Hold the final stage for the remaining pin distance.
        timeline.to({}, { duration: 0.5 }, 4.5)

        const refreshFrame = window.requestAnimationFrame(() => {
          ScrollTrigger.refresh()
        })

        return () => {
          window.cancelAnimationFrame(refreshFrame)
          section.classList.remove('is-pinned')
          activeRef.current = 0
          setActiveStage(0)
        }
      })

      return () => {
        media.revert()
      }
    },
    { scope: sectionRef },
  )

  return (
    <section
      className="landing-section story-section"
      id="how-it-works"
      ref={sectionRef}
      aria-labelledby="story-title"
    >
      <div className="landing-container">
        <SectionRule />

        <div className="story__intro">
          <RevealHeading />
          <div className="story__intro-side">
            <span className="story__how">
              <ScanLine size={13} aria-hidden="true" />
              Follow the document
            </span>
            <p>
              An illustrated walkthrough of the experience. Nothing on this
              page is processed from a real report.
            </p>
          </div>
        </div>

        <div className="story__pin" ref={pinRef}>
          <div className="story__layout">
            <div className="story__rail-wrap">
              <div className="story__rail-progress" aria-hidden="true">
                <span
                  className="story__rail-progress__fill"
                  style={{
                    height: `${(activeStage / (stages.length - 1)) * 100}%`,
                  }}
                />
              </div>
              <ol className="story__rail">
              {stages.map((stage, index) => {
                const Icon = stage.icon
                return (
                  <li
                    className={`story-step${
                      index === activeStage ? ' is-active' : ''
                    }${index < activeStage ? ' is-past' : ''}`}
                    key={stage.number}
                  >
                    <span className="story-step__dot" aria-hidden="true">
                      <Icon size={13} strokeWidth={1.8} />
                    </span>
                    <div className="story-step__copy">
                      <span className="story-step__num">{stage.number}</span>
                      <h3>{stage.title}</h3>
                      <p>{stage.description}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
            </div>

            <div className="story__visual" ref={visualRef}>
              <div className="story__visual-top">
                <span>Fig. 02 — The reading path</span>
                <span>Illustrative sequence</span>
              </div>

              <div className="story-panel is-active" data-stage="0">
                <PanelHead index={0} />
                <div className="story-paper">
                  <div className="story-paper__top">
                    <span>Sample laboratory report</span>
                    <span className="story-paper__stamp">SAMPLE</span>
                  </div>
                  <h3>Comprehensive metabolic panel</h3>
                  <p className="story-paper__meta">
                    Collected 12 Mar 2026 · Method: immunoassay · Page 1 of 3
                  </p>
                  <div className="story-raw-table">
                    <div className="story-raw-table__head">
                      <span>Analyte</span>
                      <span>Result</span>
                      <span>Reference</span>
                      <span>Flag</span>
                    </div>
                    {rawRows.map((row) => (
                      <div className="story-raw-row" key={row.name}>
                        <span>{row.name}</span>
                        <span className="num">{row.value}</span>
                        <span className="num">{row.ref}</span>
                        <span
                          className={`story-flag${
                            row.flag === 'L' ? ' story-flag--low' : ''
                          }`}
                        >
                          {row.flag}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="story-paper__foot">
                    <Info size={9} aria-hidden="true" />
                    Printed abbreviations and flags assume a clinical reader.
                  </p>
                </div>
              </div>

              <div className="story-panel" data-stage="1">
                <PanelHead index={1} />
                <div className="story-measurements">
                  <div className="story-measurements__head">
                    <span>
                      <Table2 size={12} aria-hidden="true" />
                      Structured measurements
                    </span>
                    <StatusBadge variant="outline" dot={false}>
                      Sample data
                    </StatusBadge>
                  </div>
                  {measurements.map((measurement) => (
                    <div className="story-measure" key={measurement.name}>
                      <div className="story-measure__top">
                        <strong>{measurement.name}</strong>
                        <span className="story-measure__value num">
                          {measurement.value}{' '}
                          <small>{measurement.unit}</small>
                        </span>
                      </div>
                      <div className="story-bar">
                        <span
                          className="story-bar__band"
                          style={{
                            left: `${measurement.low}%`,
                            width: `${measurement.high - measurement.low}%`,
                          }}
                        />
                        <span
                          className={`story-bar__marker${
                            measurement.tone === 'amber'
                              ? ' story-bar__marker--low'
                              : ''
                          }`}
                          style={{ left: `${measurement.position}%` }}
                        />
                      </div>
                      <div className="story-measure__foot">
                        <span>Printed range {measurement.reference}</span>
                        <span
                          className={
                            measurement.tone === 'amber'
                              ? 'story-measure__flag is-low'
                              : 'story-measure__flag'
                          }
                        >
                          {measurement.flag}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="story-panel" data-stage="2">
                <PanelHead index={2} />
                <div className="story-understanding">
                  <div className="story-understanding__kicker">
                    <Sparkles size={12} aria-hidden="true" />
                    Plain-language explanation
                  </div>
                  <div className="story-understanding__title">
                    <div>
                      <span>Vitamin D (25-OH)</span>
                      <h3>
                        24 <small>ng/mL</small>
                      </h3>
                    </div>
                    <span className="story-understanding__badge">
                      Below printed range
                    </span>
                  </div>
                  <div className="story-understanding__rows">
                    <div className="story-understanding__row">
                      <span>01</span>
                      <div>
                        <h4>What this measures</h4>
                        <p>
                          Vitamin D supports calcium absorption and bone and
                          muscle function.
                        </p>
                      </div>
                    </div>
                    <div className="story-understanding__row">
                      <span>02</span>
                      <div>
                        <h4>How to read the range</h4>
                        <p>
                          The printed range describes a reference population,
                          not a target for every individual.
                        </p>
                      </div>
                    </div>
                    <div className="story-understanding__row">
                      <span>03</span>
                      <div>
                        <h4>What it cannot tell you</h4>
                        <p>
                          A single value does not establish a cause or a
                          diagnosis. Your clinician interprets it with your
                          history.
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="story-understanding__source">
                    <BookOpenText size={9} aria-hidden="true" />
                    Educational context · source attached · not a diagnosis
                  </p>
                </div>
              </div>

              <div className="story-panel" data-stage="3">
                <PanelHead index={3} />
                <div className="story-evidence">
                  <div className="story-evidence__head">
                    <span>
                      <BookOpenText size={12} aria-hidden="true" />
                      Context, with its sources in view
                    </span>
                    <StatusBadge variant="outline" dot={false}>
                      Traceable
                    </StatusBadge>
                  </div>
                  <div className="story-evidence__map">
                    <svg
                      className="story-evidence__svg"
                      viewBox="0 0 420 220"
                      preserveAspectRatio="none"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path
                        className="story-evidence__path"
                        d="M 92 58 C 160 58, 150 116, 210 116 C 270 116, 262 176, 328 176"
                        pathLength={1}
                        stroke="rgba(18, 37, 31, 0.34)"
                        strokeWidth="1"
                        strokeDasharray="1"
                        strokeDashoffset="0"
                        vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                    <div className="story-evidence__node story-evidence__node--report">
                      <span>01</span>
                      <strong>Original report</strong>
                      <small>Value, unit and printed range</small>
                    </div>
                    <div className="story-evidence__node story-evidence__node--range">
                      <span>02</span>
                      <strong>Reference method</strong>
                      <small>Ranges vary by laboratory</small>
                    </div>
                    <div className="story-evidence__node story-evidence__node--context">
                      <span>03</span>
                      <strong>Your context</strong>
                      <small>History, medication, symptoms</small>
                    </div>
                  </div>
                  <p className="story-evidence__note">
                    <Info size={9} aria-hidden="true" />
                    The explanation never travels further from its evidence than
                    the evidence allows.
                  </p>
                </div>
              </div>

              <div className="story-panel" data-stage="4">
                <PanelHead index={4} />
                <div className="story-followup">
                  <div className="story-followup__head">
                    <span>
                      <Stethoscope size={12} aria-hidden="true" />
                      Appointment brief · sample
                    </span>
                    <StatusBadge variant="lime" dot={false}>
                      Illustrative
                    </StatusBadge>
                  </div>
                  <h3>Questions for your clinician</h3>
                  <ol>
                    <li className="story-followup__item">
                      <span>01</span>
                      Which of these results matters most for me, and why?
                    </li>
                    <li className="story-followup__item">
                      <span>02</span>
                      Are any values meaningfully different from my previous
                      reports?
                    </li>
                    <li className="story-followup__item">
                      <span>03</span>
                      Does anything here need to be rechecked, and when?
                    </li>
                  </ol>
                  <p className="story-followup__foot">
                    <Check size={10} aria-hidden="true" />
                    Bring the original report · Prepared, not prescribed
                  </p>
                </div>
              </div>

              <div className="story__progress" aria-hidden="true">
                <span
                  className="story__progress-fill"
                  style={{
                    transform: `scaleX(${(activeStage + 1) / stages.length})`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PanelHead({ index }: { index: number }) {
  const stage = stages[index]
  return (
    <div className="story-panel__head">
      <span>
        Stage {stage.number} · {stage.label}
      </span>
      <h3>{stage.title}</h3>
      <p>{stage.description}</p>
    </div>
  )
}

function RevealHeading() {
  return (
    <SectionHeading
      eyebrow="How it works"
      title="From document to conversation, in five clear movements."
      description="Follow one synthetic report from its raw form to a calmer, better-prepared conversation. Scroll to move through the sequence."
      id="story-title"
    />
  )
}
