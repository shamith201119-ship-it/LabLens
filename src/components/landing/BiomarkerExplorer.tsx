import { useRef, useState, type KeyboardEvent } from 'react'
import {
  ArrowRight,
  BookOpenText,
  CircleAlert,
  Info,
  Sparkles,
  TriangleAlert,
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { StatusBadge } from '../StatusBadge'
import { cx } from '../../lib/cx'
import { EASE } from '../../lib/motion'

interface Biomarker {
  id: string
  tab: string
  name: string
  value: string
  unit: string
  low: number
  high: number
  min: number
  max: number
  tone: 'below' | 'within'
  status: string
  measures: string
  range: string
  limit: string
  source: string
}

const biomarkers: Biomarker[] = [
  {
    id: 'vitamin-d',
    tab: 'Vitamin D',
    name: 'Vitamin D (25-OH)',
    value: '24',
    unit: 'ng/mL',
    low: 30,
    high: 100,
    min: 0,
    max: 110,
    tone: 'below',
    status: 'Below printed range',
    measures:
      'Vitamin D supports calcium absorption and bone and muscle function. The 25-OH form is the measurement shown on this sample report.',
    range:
      'The printed range is built from a reference population. A value below it is a prompt for context, not a diagnosis on its own.',
    limit:
      'Time of year, skin, diet and laboratory method can all influence a result. Your clinician interprets it with your history.',
    source: 'Illustrative report · reference range 30–100 ng/mL',
  },
  {
    id: 'ferritin',
    tab: 'Ferritin',
    name: 'Ferritin',
    value: '18',
    unit: 'ng/mL',
    low: 15,
    high: 150,
    min: 0,
    max: 160,
    tone: 'within',
    status: 'Within printed range',
    measures:
      'Ferritin is a protein that stores iron. The measurement is one part of how iron status is assessed, not a complete picture.',
    range:
      'The sample value sits inside the printed range, near its lower edge. Inside a range is not the same as optimal for every person.',
    limit:
      'Inflammation, infection and laboratory variation can affect ferritin. A clinician reads it alongside other results and symptoms.',
    source: 'Illustrative report · reference range 15–150 ng/mL',
  },
  {
    id: 'tsh',
    tab: 'TSH',
    name: 'Thyroid-stimulating hormone (TSH)',
    value: '1.8',
    unit: 'mIU/L',
    low: 0.4,
    high: 4,
    min: 0,
    max: 4.5,
    tone: 'within',
    status: 'Within printed range',
    measures:
      'TSH signals the thyroid gland to produce thyroid hormones. It is commonly used as part of thyroid assessment.',
    range:
      'The printed range describes where most results from a reference population fall. It does not define an individual target.',
    limit:
      'Pregnancy, medication and the timing of a test can change interpretation. This sample cannot account for any of them.',
    source: 'Illustrative report · reference range 0.4–4.0 mIU/L',
  },
]

export function BiomarkerExplorer() {
  const [activeId, setActiveId] = useState(biomarkers[0].id)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const reduceMotion = useReducedMotion()
  const active = biomarkers.find((item) => item.id === activeId) ?? biomarkers[0]

  const markerPosition = ((Number(active.value) - active.min) /
    (active.max - active.min)) *
    100
  const bandStart = ((active.low - active.min) / (active.max - active.min)) * 100
  const bandWidth = ((active.high - active.low) / (active.max - active.min)) * 100
  const lowPosition = bandStart
  const highPosition = bandStart + bandWidth

  const selectTab = (id: string) => {
    setActiveId(id)
  }

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = biomarkers.findIndex((item) => item.id === activeId)
    let nextIndex: number

    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % biomarkers.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + biomarkers.length) % biomarkers.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = biomarkers.length - 1
    } else {
      return
    }

    event.preventDefault()
    const next = biomarkers[nextIndex]
    setActiveId(next.id)
    tabRefs.current[next.id]?.focus()
  }

  return (
    <div className="biomarker">
      <div className="biomarker__tabs-row">
        <div
          className="biomarker__tabs"
          role="tablist"
          aria-label="Illustrative measurements"
        >
          {biomarkers.map((biomarker) => {
            const selected = biomarker.id === active.id
            return (
              <button
                key={biomarker.id}
                ref={(node) => {
                  tabRefs.current[biomarker.id] = node
                }}
                type="button"
                role="tab"
                id={`biomarker-tab-${biomarker.id}`}
                aria-selected={selected}
                aria-controls={`biomarker-panel-${biomarker.id}`}
                tabIndex={selected ? 0 : -1}
                className={cx(
                  'biomarker__tab',
                  selected && 'is-selected',
                  biomarker.tone === 'below' && 'is-below',
                )}
                onClick={() => selectTab(biomarker.id)}
                onKeyDown={handleTabKeyDown}
              >
                <span>{biomarker.tab}</span>
                <span className="biomarker__tab-value num">
                  {biomarker.value} <small>{biomarker.unit}</small>
                </span>
              </button>
            )
          })}
        </div>
        <p className="biomarker__caption">
          <Info size={10} aria-hidden="true" />
          Select a measurement to explore how a result is read.
        </p>
      </div>

      <div
        className="biomarker__panel"
        role="tabpanel"
        id={`biomarker-panel-${active.id}`}
        aria-labelledby={`biomarker-tab-${active.id}`}
        tabIndex={0}
        key="biomarker-panel"
      >
        <div className="biomarker__panel-top">
          <div className="biomarker__identity">
            <span className="biomarker__eyebrow">
              Illustrative measurement · synthetic data
            </span>
            <h3>{active.name}</h3>
          </div>
          <StatusBadge
            variant={active.tone === 'below' ? 'amber' : 'mint'}
            className="biomarker__status"
          >
            {active.tone === 'below' ? (
              <TriangleAlert size={9} aria-hidden="true" />
            ) : (
              <Sparkles size={9} aria-hidden="true" />
            )}
            {active.status}
          </StatusBadge>
        </div>

        <div className="biomarker__readout">
          <div>
            <div className="biomarker__value num">
              {active.value}
              <small>{active.unit}</small>
            </div>
            <p className="biomarker__reference">
              Printed reference range{' '}
              <strong className="num">
                {active.low}–{active.high} {active.unit}
              </strong>
            </p>
          </div>
          <div className="biomarker__readout-note">
            <span>Value as printed</span>
            <span>Unchanged by this illustration</span>
          </div>
        </div>

        <div className="biomarker__scale">
          <div className="biomarker__scale-labels" aria-hidden="true">
            <span style={{ left: '0%' }}>{active.min}</span>
            <span
              className="biomarker__scale-low"
              style={{ left: `${lowPosition}%` }}
            >
              {active.low}
            </span>
            <span
              className="biomarker__scale-high"
              style={{ left: `${highPosition}%` }}
            >
              {active.high}
            </span>
            <span style={{ left: '100%' }}>{active.max}</span>
          </div>
          <div
            className="biomarker__track"
            role="img"
            aria-label={`${active.name}: ${active.value} ${active.unit}. Printed reference range ${active.low} to ${active.high} ${active.unit}. ${active.status}.`}
          >
            <span className="biomarker__track-base" />
            <span
              className="biomarker__track-band"
              style={{ left: `${bandStart}%`, width: `${bandWidth}%` }}
            />
            <span
              className="biomarker__track-boundary"
              style={{ left: `${lowPosition}%` }}
            />
            <span
              className="biomarker__track-boundary"
              style={{ left: `${highPosition}%` }}
            />
            <span
              className={cx(
                'biomarker__marker',
                active.tone === 'below' && 'is-below',
              )}
              style={{ left: `${markerPosition}%` }}
            >
              <span className="biomarker__marker-bubble num">
                {active.value}
              </span>
              <span className="biomarker__marker-dot" />
            </span>
          </div>
          <div className="biomarker__scale-foot">
            <span>Illustrative scale</span>
            <span>Range as printed on the sample report</span>
          </div>
        </div>

        <div className="biomarker__explain">
          <motion.div
            key={`${active.id}-measures`}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            <span className="biomarker__explain-num">01</span>
            <h4>What this measures</h4>
            <p>{active.measures}</p>
          </motion.div>
          <motion.div
            key={`${active.id}-range`}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.04, ease: EASE }}
          >
            <span className="biomarker__explain-num">02</span>
            <h4>How to read the range</h4>
            <p>{active.range}</p>
          </motion.div>
          <motion.div
            key={`${active.id}-limit`}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: 0.08, ease: EASE }}
          >
            <span className="biomarker__explain-num">03</span>
            <h4>What it cannot tell you</h4>
            <p>{active.limit}</p>
          </motion.div>
        </div>

        <div className="biomarker__foot">
          <p>
            <BookOpenText size={10} aria-hidden="true" />
            {active.source}
          </p>
          <p>
            <CircleAlert size={10} aria-hidden="true" />
            Actual interpretation depends on the original laboratory range and
            your individual context.
          </p>
        </div>
      </div>

      <p className="biomarker__disclaimer">
        <Info size={10} aria-hidden="true" />
        An illustrative interface, not a diagnostic tool. The three values above
        are synthetic and never change randomly.
        <span>
          <ArrowRight size={9} aria-hidden="true" />
          Educational context only
        </span>
      </p>
    </div>
  )
}
