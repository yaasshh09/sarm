// One tick per acquisition, spaced by real time, with the permanent NISAR data gap shaded.

const GAP = ['2026-07-27', '2026-08-10'] // permanent instrument gap (nisar-docs availability overview)
const fmt = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })

type Props = { dates: string[]; flagged: boolean[]; idx: number; before?: number; onPick: (i: number) => void }

export function Timeline({ dates, flagged, idx, before, onPick }: Props) {
  const t0 = Date.parse(dates[0]) - 4 * 864e5
  const t1 = Date.parse(dates[dates.length - 1]) + 4 * 864e5
  const pct = (d: string) => `${((Date.parse(d) - t0) / (t1 - t0)) * 100}%`
  const gapIn = Date.parse(GAP[1]) > t0 && Date.parse(GAP[0]) < t1

  return (
    <div className="timeline" role="group" aria-label="Acquisition dates">
      {gapIn && (
        <div className="gap" style={{ left: pct(GAP[0]), width: `calc(${pct(GAP[1])} - ${pct(GAP[0])})` }} title="Permanent NISAR data gap, 27 Jul to 10 Aug 2026">
          <span>no data (mission gap)</span>
        </div>
      )}
      {dates.map((d, i) => (
        <button
          key={d}
          className={`tick${i === idx ? ' on' : ''}${i === before ? ' before' : ''}${flagged[i] ? ' flagged' : ''}`}
          style={{ left: pct(d) }}
          onClick={() => onPick(i)}
          aria-label={`${d}${flagged[i] ? ', flagged' : ''}`}
          aria-pressed={i === idx}
        >
          <span>{fmt(d)}</span>
        </button>
      ))}
    </div>
  )
}
