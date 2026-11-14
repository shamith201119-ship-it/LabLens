export function SectionRule({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  return (
    <span
      className={`section-rule${tone === 'dark' ? ' section-rule--dark' : ''}`}
      data-section-rule
      aria-hidden="true"
    >
      <span className="section-rule__dot" />
    </span>
  )
}
