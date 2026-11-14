// Small SVG line chart of backscatter (dB) against date. Hollow points are flagged dates.

export type Series = { name: string; color: string; values: number[] }

const W = 320, H = 170, L = 34, R = 8, T = 8, B = 22
const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function Chart({ dates, series, flagged, current }: { dates: string[]; series: Series[]; flagged: boolean[]; current?: number }) {
  const vals = series.flatMap((s) => s.values).filter(Number.isFinite)
  if (!vals.length) return <p className="muted">No valid data in this selection.</p>
  const lo = Math.floor(Math.min(...vals)) - 1
  const hi = Math.ceil(Math.max(...vals)) + 1
  const t = dates.map((d) => Date.parse(d))
  const span = t[t.length - 1] - t[0] || 1
  const x = (i: number) => L + ((t[i] - t[0]) / span) * (W - L - R)
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B)
  const step = hi - lo > 12 ? 5 : 2
  const yTicks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v)

  const path = (v: number[]) =>
    v.map((val, i) => (Number.isFinite(val) ? `${i && Number.isFinite(v[i - 1]) ? 'L' : 'M'}${x(i)},${y(val)}` : '')).join('')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Backscatter time series">
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 4} y={y(v) + 3} textAnchor="end">{v}</text>
        </g>
      ))}
      <text x={4} y={T + 4} className="unit">dB</text>
      {[0, Math.floor((dates.length - 1) / 2), dates.length - 1].map((i) => (
        <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{fmt(dates[i])}</text>
      ))}
      {current !== undefined && <line x1={x(current)} x2={x(current)} y1={T} y2={H - B} className="now" />}
      {series.map((s) => (
        <g key={s.name}>
          <path d={path(s.values)} stroke={s.color} fill="none" strokeWidth={1.8} />
          {s.values.map((v, i) => Number.isFinite(v) && (
            <circle key={i} cx={x(i)} cy={y(v)} r={3} stroke={s.color} fill={flagged[i] ? 'var(--bg)' : s.color}>
              <title>{`${s.name} ${dates[i]}: ${v.toFixed(1)} dB${flagged[i] ? ' (flagged)' : ''}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </svg>
  )
}
