import { useRef, useState, type CSSProperties } from 'react'
import { ChevronsLeftRight, FileText, Info, ShieldCheck, Sparkles } from 'lucide-react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SectionHeading } from '../SectionHeading'
import { Reveal } from '../motion'
import { prefersReducedMotion } from '../../lib/motionEnvironment'
import { SectionRule } from './SectionRule'

gsap.registerPlugin(ScrollTrigger)

const RAW_ROWS = [
  {
    name: 'Vitamin D (25-OH)',
    value: '24',
    unit: 'ng/mL',
    range: '30 – 100',
    flag: 'LOW',
  },
  {
    name: 'Ferritin',
    value: '18',
    unit: 'ng/mL',
    range: '15 – 150',
    flag: '—',
  },
  {
    name: 'TSH',
    value: '1.8',
    unit: 'mIU/L',
    range: '0.4 – 4.0',
    flag: '—',
  },
]

/**
 * The translation layer: the original report and the plain-language reading
 * occupy the same rectangle, split by a movable rule. The range input is the
 * real control (keyboard + pointer); the visible handle is its affordance.
 */
export function TranslationLayer() {
  const root = useRef<HTMLElement>(null)
  const compare = useRef<HTMLDivElement>(null)
  const intro = useRef<gsap.core.Tween | null>(null)
  const [split, setSplit] = useState(46)

  useGSAP(
    () => {
      const panel = compare.current
      const section = root.current
      if (!panel || !section || prefersReducedMotion()) return

      const proxy = { value: 82 }

      intro.current = gsap.fromTo(
        proxy,
        { value: 82 },
        {
          value: 46,
          ease: 'none',
          onUpdate: () => {
            panel.style.setProperty('--split', `${proxy.value.toFixed(2)}%`)
          },
          scrollTrigger: {
            trigger: panel,
            start: 'top 82%',
            end: 'top 34%',
            scrub: 0.6,
          },
        },
      )

      gsap.fromTo(
        panel,
        { autoAlpha: 0, y: 24 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: panel, start: 'top 90%', once: true },
        },
      )

      return () => {
        intro.current?.scrollTrigger?.kill()
        intro.current?.kill()
      }
    },
    { scope: root },
  )

  const stopIntro = () => {
    if (!intro.current) return
    const panel = compare.current
    const current = panel
      ? Number.parseFloat(
          getComputedStyle(panel).getPropertyValue('--split') || '46',
        )
      : split
    intro.current.scrollTrigger?.kill()
    intro.current.kill()
    intro.current = null
    if (Number.isFinite(current)) setSplit(Math.round(current))
  }

  const handleChange = (value: number) => {
    stopIntro()
    setSplit(value)
  }

  return (
    <section className="landing-section translation-section" id="translation" ref={root}>
      <div className="landing-container">
        <SectionRule />

        <div className="translation__head">
          <Reveal>
            <SectionHeading
              eyebrow="The translation layer"
              title="The same result, held two ways."
              description="A printed report is precise but compressed. LabLens keeps every value, unit and printed range intact, then lays plain-language context beside it. Slide the rule to see the two readings occupy one document."
            />
          </Reveal>
          <Reveal delay={0.06}>
            <div className="translation__legend">
              <div className="translation__legend-item">
                <FileText size={14} strokeWidth={1.7} aria-hidden="true" />
                <div>
                  <strong>Nothing replaced</strong>
                  <span>The original layout, flags and ranges remain visible.</span>
                </div>
              </div>
              <div className="translation__legend-item">
                <Sparkles size={14} strokeWidth={1.7} aria-hidden="true" />
                <div>
                  <strong>Nothing overclaimed</strong>
                  <span>Context is separated from any clinical conclusion.</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.04}>
          <div
            className="compare"
            ref={compare}
            style={{ '--split': `${split}%` } as CSSProperties}
          >
            <div className="compare__pane compare__pane--plain">
              <div className="compare__pane-inner">
                <span className="compare__eyebrow">
                  <Sparkles size={11} aria-hidden="true" />
                  Plain-language layer · sample
                </span>
                <h3>One low value, read with care.</h3>
                <p>
                  Vitamin D helps the body absorb calcium and supports bone and
                  muscle function. This sample sits below the range printed on
                  the same document.
                </p>
                <p>
                  A single result is a snapshot. Sunlight, diet, supplements,
                  kidney function and the laboratory method can all shape it.
                  Your clinician reads it beside your history, not on its own.
                </p>
                <div className="compare__questions">
                  <span>Worth asking</span>
                  <p>Is this result expected for me, and does it need rechecking?</p>
                </div>
                <span className="compare__source">
                  <Info size={9} aria-hidden="true" />
                  Educational context · not a diagnosis
                </span>
              </div>
            </div>

            <div className="compare__pane compare__pane--raw">
              <div className="compare__paper">
                <div className="compare__paper-head">
                  <span>Synthetic laboratory report</span>
                  <span className="compare__stamp">Sample</span>
                </div>
                <div className="compare__paper-meta">
                  <span>Specimen · sample only</span>
                  <span>Method · illustrative</span>
                </div>
                <div className="compare__table">
                  <div className="compare__table-head">
                    <span>Measurement</span>
                    <span>Result</span>
                    <span>Reference</span>
                    <span>Flag</span>
                  </div>
                  {RAW_ROWS.map((row) => (
                    <div className="compare__row" key={row.name}>
                      <span>{row.name}</span>
                      <span className="num">
                        {row.value} <small>{row.unit}</small>
                      </span>
                      <span className="num">{row.range}</span>
                      <span
                        className={`compare__flag${row.flag === 'LOW' ? ' is-low' : ''}`}
                      >
                        {row.flag}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="compare__paper-foot">
                  Fictional values for interface demonstration. The printed
                  document remains the source of truth.
                </p>
              </div>
            </div>

            <span className="compare__tag compare__tag--raw" aria-hidden="true">
              01 · As printed
            </span>
            <span className="compare__tag compare__tag--plain" aria-hidden="true">
              02 · In plain language
            </span>

            <div className="compare__divider" aria-hidden="true">
              <span className="compare__handle">
                <ChevronsLeftRight size={15} strokeWidth={1.8} />
              </span>
            </div>

            <input
              className="compare__range"
              type="range"
              min={18}
              max={82}
              step={1}
              value={split}
              aria-label="Slide between the original report and the plain-language reading"
              aria-valuetext={`${split}% original report, ${100 - split}% plain language`}
              onChange={(event) => handleChange(Number(event.target.value))}
              onFocus={stopIntro}
              onPointerDown={stopIntro}
            />
          </div>
        </Reveal>

        <div className="translation__notes">
          <span>
            <FileText size={12} aria-hidden="true" />
            One source document
          </span>
          <span>
            <ChevronsLeftRight size={12} aria-hidden="true" />
            Drag or use arrow keys
          </span>
          <span>
            <ShieldCheck size={12} aria-hidden="true" />
            No conclusion is drawn for you
          </span>
        </div>
      </div>
    </section>
  )
}
