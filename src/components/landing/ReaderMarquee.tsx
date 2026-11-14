import { useEffect, useRef } from 'react'

const movements = [
  { num: '01', text: 'Read the value' },
  { num: '02', text: 'Keep the printed range' },
  { num: '03', text: 'Translate the language' },
  { num: '04', text: 'Ask about context' },
  { num: '05', text: 'Prepare the question' },
]

export function ReaderMarquee() {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    const band = root.current
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
      className="reader-marquee"
      aria-label="The five reading movements"
      ref={root}
    >
      <div className="landing-container reader-marquee__intro">
        <span className="reader-marquee__kicker">Reading movements</span>
        <h2 className="reader-marquee__title">
          Five movements, one quieter reading.
        </h2>
      </div>

      <div className="reader-marquee__viewport">
        <div className="reader-marquee__track">
          {[0, 1].map((copy) => (
            <div
              className="reader-marquee__group"
              key={copy}
              aria-hidden={copy === 1 ? 'true' : undefined}
            >
              {movements.map((movement) => (
                <span className="reader-marquee__item" key={`${copy}-${movement.num}`}>
                  <span className="reader-marquee__num num">{movement.num}</span>
                  <span className="reader-marquee__text">{movement.text}</span>
                  <span className="reader-marquee__dot" aria-hidden="true" />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
