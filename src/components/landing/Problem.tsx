import { Info } from 'lucide-react'
import { SectionHeading } from '../SectionHeading'
import { Reveal } from '../motion'
import { SectionRule } from './SectionRule'

const problems = [
  {
    number: '01',
    title: 'Numbers without context',
    description:
      'A value outside a printed range can be routine for one person and meaningful for another. Without context, a bolded number is easy to misread.',
    tag: 'Context matters',
  },
  {
    number: '02',
    title: 'Explanations everywhere, trust nowhere',
    description:
      'Searching a measurement name opens a maze of forums, advertisements and worst-case anecdotes — rarely the source that applies to you.',
    tag: 'Signal over noise',
  },
  {
    number: '03',
    title: 'An appointment moves fast',
    description:
      'Time with a clinician is short. Arriving with the right questions can turn a rushed conversation into a useful one.',
    tag: 'Preparation helps',
  },
]

export function Problem() {
  return (
    <section className="landing-section" id="problem">
      <div className="landing-container">
        <SectionRule />
        <div className="problem__grid">
          <div className="problem__intro">
            <SectionHeading
              eyebrow="Why LabLens"
              title={
                <>
                  A report full of answers.
                  <br />
                  Very little explanation.
                </>
              }
              description="Lab reports are written for clinical readers. For everyone else, a page of measurements and abbreviations can raise more questions than it answers."
            />
            <Reveal>
              <p className="problem__note">
                <Info size={15} aria-hidden="true" />
                <span>
                  LabLens does not replace the interpretation printed on your
                  report or the judgement of your clinician. It helps you
                  understand the document and prepare to discuss it.
                </span>
              </p>
            </Reveal>
          </div>

          <div className="problem__list">
            {problems.map((problem, index) => (
              <Reveal key={problem.number} delay={index * 0.05}>
                <article className="problem-item">
                  <span className="problem-item__num" aria-hidden="true">
                    {problem.number}
                  </span>
                  <div>
                    <h3>{problem.title}</h3>
                    <p>{problem.description}</p>
                    <span className="problem-item__tag">{problem.tag}</span>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
