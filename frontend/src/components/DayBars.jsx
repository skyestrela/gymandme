/* One bar per day, for a number that is a daily total rather than a trend: how much water, how
 * many hours fasted, how many calories. LineChart would draw a day you did not log as a straight
 * run through the gap, which reads as "steady" when it was really "nothing".
 *
 * A goal is a line across the plot, and a day that reached it is the full tint — the rest are the
 * muted one, so a run of good days is visible without reading a single number.
 */
import { fmtDate } from '../lib/format.js'
import { t } from '../lib/i18n.js'

export default function DayBars({ days, goal = 0, color = 'var(--acc)', unit = '', label = '' }) {
  if (!Array.isArray(days) || days.length === 0) return null
  const max = Math.max(Number(goal) || 0, ...days.map(d => Number(d.v) || 0), 1)
  const atGoal = Number(goal) > 0
  return <div className="daybars" role="img" aria-label={label}>
    {days.map(d => (
      <div key={d.d} className="daybars-col" title={`${fmtDate(d.d)} · ${d.v}${unit ? ' ' + unit : ''}`}>
        <i style={{ height: `${Math.min(100, ((Number(d.v) || 0) / max) * 100)}%`, background: atGoal && d.v >= goal ? color : 'var(--surface-3)' }} />
      </div>
    ))}
    {atGoal && <span className="daybars-goal" style={{ bottom: `${Math.min(100, (goal / max) * 100)}%` }} aria-hidden="true" />}
  </div>
}