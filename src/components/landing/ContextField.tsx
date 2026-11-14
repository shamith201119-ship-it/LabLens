import { useRef } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

import { prefersReducedMotion } from '../../lib/motionEnvironment'

gsap.registerPlugin(ScrollTrigger)

const contextItems = [
  'Sleep',
  'Medication',
  'Time of day',
  'Laboratory method',
  'Recent illness',
  'Stress',
  'Diet',
  'Hydration',
  'Season',
  'Menstrual cycle',
  'Exercise',
  'Travel',
]

export function ContextField() {
  const root = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const field = root.current
      if (!field || prefersReducedMotion()) return

      const q = gsap.utils.selector(field)
      const chips = q<HTMLElement>('.context-chip')

      gsap.fromTo(
        chips,
        { autoAlpha: 0, y: 12 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.04,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: field,
            start: 'top 82%',
            once: true,
          },
        },
      )
    },
    { scope: root },
  )

  return (
    <div className="context-field" ref={root}>
      <div className="context-field__head">
        <span className="context-field__label">Context field</span>
        <span className="context-field__note">
          Twelve inputs a single measurement cannot carry
        </span>
      </div>

      <div className="context-field__grid">
        {contextItems.map((item) => (
          <span className="context-chip" key={item}>
            <span className="context-chip__dot" aria-hidden="true" />
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
