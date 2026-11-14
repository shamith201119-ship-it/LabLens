import { Check, Info, Stethoscope } from 'lucide-react'
import { SectionHeading } from '../SectionHeading'
import { Reveal } from '../motion'
import { SectionRule } from './SectionRule'

const prepPoints = [
  'Re-read your report beside the reference ranges printed on the original document.',
  'Note symptoms, medications and questions you want to raise while they are fresh.',
  'Ask which results, if any, need follow-up testing — and what the next step would be.',
  'Bring the original report as well as any summary you have written.',
]

const questions = [
  'Which of these results matters most for me, and why?',
  'Are any values meaningfully different from my previous reports?',
  'Could anything in my history or medication affect these results?',
  'Does anything here need to be rechecked, and when?',
]

export function Preparation() {
  return (
    <section className="landing-section landing-section--white" id="preparation">
      <div className="landing-container">
        <SectionRule />
        <div className="prep__grid">
          <div>
            <Reveal>
              <SectionHeading
                eyebrow="Before your appointment"
                title="Walk in with the right questions."
                description="Understanding a report is only useful if it leads somewhere. LabLens is designed to help you arrive prepared, not to speak for you."
              />
            </Reveal>
            <div className="prep-points">
              {prepPoints.map((point, index) => (
                <Reveal key={point} delay={index * 0.04}>
                  <p className="prep-point">
                    <span className="prep-point__check" aria-hidden="true">
                      <Check size={12} strokeWidth={2.4} />
                    </span>
                    <span>{point}</span>
                  </p>
                </Reveal>
              ))}
            </div>
          </div>

          <Reveal delay={0.08}>
            <div className="consult-card">
              <div className="consult-card__bar" aria-hidden="true" />
              <div className="consult-card__inner">
                <div className="consult-card__top">
                  <div>
                    <span className="consult-card__label">
                      Appointment brief · illustrative
                    </span>
                    <h3>Questions for your clinician</h3>
                  </div>
                  <span className="consult-card__mark" aria-hidden="true">
                    <Stethoscope size={16} strokeWidth={1.7} />
                  </span>
                </div>

                <div className="consult-questions">
                  {questions.map((question, index) => (
                    <div className="consult-question" key={question}>
                      <span
                        className="consult-question__num"
                        aria-hidden="true"
                      >
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>{question}</span>
                    </div>
                  ))}
                </div>

                <p className="consult-card__foot">
                  <Info size={10} aria-hidden="true" />
                  Illustrative question set. A brief should support your
                  consultation, never replace the original report.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
