interface ProgressRingProps {
  /** 0..1 fraction of confirmed measurements. */
  fraction: number
  /** Confirmed / total counts, shown as the centre readout. */
  confirmed: number
  total: number
  size?: number
  stroke?: number
}

/**
 * Quiet SVG progress ring for review completion.
 * Deterministic from real verification state; no animation libraries.
 */
export function ProgressRing({
  fraction,
  confirmed,
  total,
  size = 96,
  stroke = 7,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, fraction))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = circumference * clamped

  return (
    <svg
      className="ve-ring"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${confirmed} of ${total} results confirmed`}
    >
      <circle
        className="ve-ring__track"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        className="ve-ring__value"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        strokeDashoffset={0}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="45%" className="ve-ring__number" textAnchor="middle" dominantBaseline="middle">
        {total === 0 ? '—' : `${Math.round(clamped * 100)}%`}
      </text>
      <text x="50%" y="66%" className="ve-ring__caption" textAnchor="middle" dominantBaseline="middle">
        confirmed
      </text>
    </svg>
  )
}
