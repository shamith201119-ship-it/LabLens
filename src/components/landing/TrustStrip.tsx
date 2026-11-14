import { BookOpenCheck, FileCheck2, Stethoscope } from 'lucide-react'

const items = [
  {
    icon: FileCheck2,
    title: 'Values as printed',
    description: 'Every measurement stays tied to its original document.',
  },
  {
    icon: BookOpenCheck,
    title: 'Context, not conclusions',
    description: 'Plain-language explanations that never diagnose.',
  },
  {
    icon: Stethoscope,
    title: 'Clinician in the loop',
    description: 'Built to prepare better questions for your appointment.',
  },
]

export function TrustStrip() {
  return (
    <section className="trust-strip" aria-label="Design principles">
      <div className="trust-strip__inner">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <div className="trust-item" key={item.title}>
              <Icon size={19} strokeWidth={1.6} aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                {item.description}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
