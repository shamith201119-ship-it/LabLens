import { useRef } from 'react'
import { gsap } from 'gsap'
import { useGSAP } from '@gsap/react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Reveal } from '../motion'
import { prefersReducedMotion } from '../../lib/motionEnvironment'
import { SectionRule } from './SectionRule'

gsap.registerPlugin(ScrollTrigger)

const statement =
  'A lab report records measurements. It does not know your sleep, your medication, your history, or the conversation that should follow. LabLens returns that context without pretending to replace the clinician who interprets it.'

const principles = [
  {
    number: '01',
    title: 'Plain language, without flattening nuance.',
    body: 'Clear wording is a design requirement. Oversimplifying the medicine is not.',
  },
  {
    number: '02',
    title: 'Source first.',
    body: 'Every explanation stays connected to the document and evidence behind it.',
  },
  {
    number: '03',
    title: 'No diagnosis by algorithm.',
    body: 'The clinician remains the interpreter. LabLens is preparation, not a verdict.',
  },
  {
    number: '04',
    title: 'Privacy is a design requirement.',
    body: 'Secure processing and minimal data retention belong in the foundations, not a premium tier.',
  },
]

/**
 * The closing manifesto: a scroll-lit statement, an instrument diagram and the
 * four principles that constrain the product. The statement is split into
 * words and brightened on scrub; without motion every word is fully legible.
 */
export function Manifesto() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const section = root.current
      if (!section || prefersReducedMotion()) return

      const q = gsap.utils.selector(section)
      const words = q<HTMLElement>('.manifesto__word')

      gsap.fromTo(
        words,
        { opacity: 0.16 },
        {
          opacity: 1,
          stagger: 0.08,
          ease: 'none',
          scrollTrigger: {
            trigger: q<HTMLElement>('.manifesto__statement')[0],
            start: 'top 76%',
            end: 'bottom 58%',
            scrub: 0.5,
          },
        },
      )

      gsap.fromTo(
        q<HTMLElement>('.manifesto__lens'),
        { y: 30, rotate: -1.2 },
        {
          y: -18,
          rotate: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: q<HTMLElement>('.manifesto__aside')[0],
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.7,
          },
        },
      )

      gsap.fromTo(
        q<HTMLElement>('.manifesto__ring'),
        { scale: 0.9, autoAlpha: 0 },
        {
          scale: 1,
          autoAlpha: 1,
          duration: 1.1,
          stagger: 0.12,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: q<HTMLElement>('.manifesto__aside')[0],
            start: 'top 78%',
            once: true,
          },
        },
      )
    },
    { scope: root },
  )

  return (
    <section className="landing-section manifesto-section" id="about" ref={root}>
      <div className="landing-container">
        <SectionRule />

        <div className="manifesto__top">
          <Reveal>
            <p className="manifesto__kicker">A note on intent</p>
          </Reveal>
          <Reveal delay={0.04}>
            <span className="manifesto__fig">Fig. 01 — Context lens</span>
          </Reveal>
        </div>

        <div className="manifesto__grid">
          <div className="manifesto__copy">
            <p className="manifesto__statement">
              {statement.split(' ').map((word, index) => (
                <span className="manifesto__word" key={`${word}-${index}`}>
                  {word}{' '}
                </span>
              ))}
            </p>

            <Reveal delay={0.08}>
              <p className="manifesto__caption">
                The report is the specimen. Context is the lens. The clinician
                is still the one who looks through it.
              </p>
            </Reveal>
          </div>

          <div className="manifesto__aside">
            <div className="manifesto__flow">
              <span className="manifesto__flow-label">The reading path</span>
              <ol className="manifesto__flow-list">
                <li>
                  <span className="num">01</span>
                  <span>Document</span>
                </li>
                <li>
                  <span className="num">02</span>
                  <span>Range</span>
                </li>
                <li>
                  <span className="num">03</span>
                  <span>Context</span>
                </li>
                <li className="manifesto__flow-end">
                  <span className="num">04</span>
                  <span>Clinician</span>
                </li>
              </ol>
              <p className="manifesto__flow-note">
                Source visible at every step.
              </p>
            </div>
          </div>
        </div>

        <div className="manifesto__principles">
          {principles.map((principle) => (
            <div className="manifesto__principle" key={principle.number}>
              <span className="num" aria-hidden="true">
                {principle.number}
              </span>
              <h3>{principle.title}</h3>
              <p>{principle.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
