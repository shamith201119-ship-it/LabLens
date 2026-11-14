import { useId } from 'react'
import type { BiomarkerObservation } from '../lib/api'

interface TrendChartProps {
  observations: BiomarkerObservation[]
  testName: string
}

export function TrendChart({ observations, testName }: TrendChartProps) {
  const chartId = useId()
  // Filter for numeric, trend-eligible observations with dates
  const eligible = observations.filter((o) => o.trend_eligible && o.value_numeric !== null)

  if (eligible.length === 0) {
    return (
      <div className="trend-chart-empty" role="status">
        <p>No verified numeric observations available to plot.</p>
      </div>
    )
  }

  if (eligible.length === 1) {
    const single = eligible[0]
    return (
      <div className="trend-chart-single" role="region" aria-label={`Single measurement for ${testName}`}>
        <div className="trend-single-box">
          <span className="trend-single-val">{single.value_original} {single.unit ?? ''}</span>
          <span className="trend-single-date">
            Recorded {new Date(single.date ?? '').toLocaleDateString()} ({single.date_provenance === 'sample_date' ? 'Report date' : 'Uploaded'})
          </span>
          {single.reference_range && (
            <span className="trend-single-ref">Laboratory reference interval: {single.reference_range}</span>
          )}
        </div>
        <p className="trend-chart-note">
          Only one observation recorded. Two or more observations are required to plot a trend line.
        </p>
      </div>
    )
  }

  // Calculate scales for SVG rendering
  const width = 640
  const height = 240
  const padding = { top: 30, right: 30, bottom: 40, left: 55 }

  const values = eligible.map((d) => d.value_numeric as number)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const valRange = maxVal - minVal || 1

  // Add 15% margin on top and bottom of value scale
  const yMin = Math.floor(minVal - valRange * 0.15)
  const yMax = Math.ceil(maxVal + valRange * 0.15)
  const yDomain = yMax - yMin || 1

  const getY = (val: number) => {
    const norm = (val - yMin) / yDomain
    return height - padding.bottom - norm * (height - padding.top - padding.bottom)
  }

  const getX = (idx: number) => {
    const availableWidth = width - padding.left - padding.right
    const step = availableWidth / (eligible.length - 1)
    return padding.left + idx * step
  }

  // Points path for trendline
  const points = eligible.map((d, i) => `${getX(i)},${getY(d.value_numeric as number)}`).join(' ')

  return (
    <div className="trend-chart-container" role="region" aria-label={`Historical trend chart for ${testName}`}>
      <div className="trend-chart-svg-wrap">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="trend-chart-svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`trend-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--mint)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--mint)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          <line
            x1={padding.left}
            y1={getY(yMin)}
            x2={width - padding.right}
            y2={getY(yMin)}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <line
            x1={padding.left}
            y1={getY((yMin + yMax) / 2)}
            x2={width - padding.right}
            y2={getY((yMin + yMax) / 2)}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <line
            x1={padding.left}
            y1={getY(yMax)}
            x2={width - padding.right}
            y2={getY(yMax)}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />

          {/* Area under curve */}
          <polygon
            points={`${getX(0)},${height - padding.bottom} ${points} ${getX(eligible.length - 1)},${height - padding.bottom}`}
            fill={`url(#trend-grad-${chartId})`}
          />

          {/* Trend Polyline */}
          <polyline
            fill="none"
            stroke="var(--mint)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={points}
          />

          {/* Data Points */}
          {eligible.map((d, i) => {
            const cx = getX(i)
            const cy = getY(d.value_numeric as number)
            const isCrit = d.lab_flag && (d.lab_flag.toLowerCase().includes('crit') || d.lab_flag.toLowerCase().includes('panic'))
            return (
              <g key={d.measurement_id} className="trend-point-group">
                <circle
                  cx={cx}
                  cy={cy}
                  r="5"
                  fill={isCrit ? 'var(--critical)' : 'var(--surface)'}
                  stroke={isCrit ? 'var(--critical)' : 'var(--ink)'}
                  strokeWidth="2"
                />
                {/* Floating Value label */}
                <text
                  x={cx}
                  y={cy - 10}
                  textAnchor="middle"
                  className="trend-point-label"
                >
                  {d.value_original}
                </text>
                {/* Date label on X axis */}
                <text
                  x={cx}
                  y={height - padding.bottom + 18}
                  textAnchor="middle"
                  className="trend-axis-label"
                >
                  {d.date ? new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : `Obs ${i + 1}`}
                </text>
              </g>
            )
          })}

          {/* Y Axis min & max labels */}
          <text x={padding.left - 8} y={getY(yMax) + 4} textAnchor="end" className="trend-axis-val">
            {yMax}
          </text>
          <text x={padding.left - 8} y={getY(yMin) + 4} textAnchor="end" className="trend-axis-val">
            {yMin}
          </text>
        </svg>
      </div>

      {/* Accessible Data Table alternative */}
      <div className="trend-table-wrap">
        <table className="trend-data-table" aria-label={`Recorded data points for ${testName}`}>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Recorded Result</th>
              <th scope="col">Unit</th>
              <th scope="col">Laboratory Range</th>
              <th scope="col">Report Source</th>
            </tr>
          </thead>
          <tbody>
            {eligible.map((d) => (
              <tr key={d.measurement_id}>
                <td>
                  <strong>{d.date ? new Date(d.date).toLocaleDateString() : 'Undated'}</strong>
                  <span className="doc-subtext"> ({d.date_provenance === 'sample_date' ? 'Report date' : 'Upload date'})</span>
                </td>
                <td className="doc-tabular"><strong>{d.value_original}</strong></td>
                <td>{d.unit ?? '—'}</td>
                <td className="doc-tabular">{d.reference_range ?? 'Not specified'}</td>
                <td>{d.filename ?? d.report_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
