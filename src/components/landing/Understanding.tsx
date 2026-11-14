import { Info } from 'lucide-react'
import { SectionHeading } from '../SectionHeading'
import { Reveal } from '../motion'
import { BiomarkerExplorer } from './BiomarkerExplorer'
import { ContextField } from './ContextField'
import { SectionRule } from './SectionRule'

const principles = [
  {
    number: '01',
    title: 'The measurement',
    description:
      'What was tested, in plain language, alongside the name and abbreviation printed on the report.',
  },
  {
    number: '02',
    title: 'The reference range',
    description:
      'Ranges are built from populations, not from one person. The range printed on your document stays visible.',
  },
  {
    number: '03',
    title: 'The wider context',
    description:
      'Medication, sleep, diet, time of day and laboratory method can all shape a value. One result rarely tells the whole story.',
  },
]

export function Understanding() {
  return (
    <section className="landing-section understanding" id="understanding">
      <div className="landing-container">
        <SectionRule />

        <div className="understanding__head">
          <Reveal>
            <SectionHeading
              eyebrow="Reading a result"
              title="A number is only useful in context."
              description="Explore how LabLens is designed to hold a measurement, its printed range and its limits together — without pretending the whole picture is contained in one value."
            />
          </Reveal>
          <Reveal delay={0.06}>
            <div className="understanding__aside">
              <span className="understanding__aside-label">
                Interactive illustration
              </span>
              <p>
                Choose a synthetic measurement. The marker, explanation and
                caveats update together, and the value itself never changes.
              </p>
              <p className="understanding__aside-note">
                <Info size={10} aria-hidden="true" />
                Ranges vary by laboratory. This is not clinical advice.
              </p>
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.05}>
          <BiomarkerExplorer />
        </Reveal>

        <div className="understanding__principles">
          {principles.map((principle) => (
            <div className="understanding__principle" key={principle.number}>
              <span aria-hidden="true">{principle.number}</span>
              <div>
                <h3>{principle.title}</h3>
                <p>{principle.description}</p>
              </div>
            </div>
          ))}
        </div>

        <ContextField />
      </div>
    </section>
  )
}
