/* The day's water, drawn as the body it goes into.
 *
 * One geometry set does three jobs: it is the clip the water is poured through, the empty shell
 * behind it, and the outline on top. So the level is body-shaped at every height without a second
 * silhouette to keep in step with the first — there is one path, and it cannot drift.
 *
 * The silhouette is drawn here rather than borrowed from lib/body-paths.js, which is 94 KB of
 * third-party MIT geometry converted from MuscleMap and shaped as one path per muscle for the
 * heatmap: the wrong asset and the wrong licence boundary for a card on Home.
 *
 * Two densities of the same list: the card shows the four titles alone, because the point
 * there is to make you remember what you are drinking towards; the sheet has room for the
 * reason behind each one, and for the leaders that tie a benefit to the part of the body it
 * belongs to.
 *
 * The bubbles are the one thing in the app that moves for no reason except that it looks right.
 * That is a deliberate exception to design-system rule 4 ("nothing bounces or slides for
 * decoration"), and three things keep it honest: transform and opacity only, so it never touches
 * layout; not rendered when the body is empty or the goal is met, so nothing loops forever; and
 * the global prefers-reduced-motion rule (index.css:147) already switches it off. Removing
 * .wl-bubbles and @keyframes bubble takes the whole thing back out again.
 */
import { useId } from 'react'
import { fmtNum } from '../lib/format.js'
import { t } from '../lib/i18n.js'

const HEAD = { cx: 60, cy: 22, r: 13 }
// Shoulders at the top, arms falling to the hips, then the legs as two tapered shapes. Geometry
// snapped to .5 so the outline lands on a pixel edge at the sizes it is drawn at.
const TORSO = 'M60 40C47 40 38 45 34 52L26 88C25 92 27 95 31 95H38L35 106H85L82 95H89C93 95 95 92 94 88L86 52C82 45 73 40 60 40Z'
const LEG_L = 'M35 106H57L55 160C55 164 53 167 49 167H43C39 167 37 164 37 160Z'
const LEG_R = 'M63 106H85L83 160C83 164 81 167 77 167H71C67 167 65 164 65 160Z'

// One row per benefit, in the order the day earns them. `x` is where the leader leaves the body at
// that height, `y` the height itself, `need` the fraction of the goal that unlocks it. Each is a
// tendency, never a promise: a dry head is a real and common early sign, but nobody's headache is
// guaranteed to be about water.
const BEN = [
  { x: 76, y: 20, need: 0.25, title: 'Fewer headaches', note: 'Mild dehydration is a common trigger.' },
  { x: 94, y: 62, need: 0.50, title: 'Clearer head', note: 'Alertness and mood dip with even a little water short.' },
  { x: 97, y: 92, need: 0.75, title: 'Less hungry', note: 'A glass before a meal cuts how much you eat.' },
  { x: 87, y: 135, need: 1.00, title: 'Stronger in the session', note: 'Past about 2% of your weight you start losing output.' },
]

// Five bubbles, staggered so they never rise in step. cy is near the foot, and the rise is capped
// below the head so they run out of water rather than out of body.
const BUBBLES = [[46, 0], [61, -1.15], [73, -2.3], [52, -3.45], [68, -4.6]]

export default function WaterBody({ ml, goal, size = 'sm', showBenefits = false, compact = false }) {
  // useId keeps the clip paths apart when a card and a sheet are both on screen. React's format
  // has changed between majors, so strip anything that is not safe inside url(#…).
  const raw = useId()
  const id = `wb${String(raw).replace(/[^a-zA-Z0-9]/g, '')}`

  const m = Math.max(0, Number(ml) || 0)
  const g = Number(goal) > 0 ? Number(goal) : 0
  const pct = g > 0 ? Math.min(1, m / g) : 0
  const top = 170 - 170 * pct
  const left = Math.max(0, Math.round(g - m))

  const shapes = <>
    <circle cx={HEAD.cx} cy={HEAD.cy} r={HEAD.r} />
    <path d={TORSO} />
    <path d={LEG_L} />
    <path d={LEG_R} />
  </>

  return <div className={'wl-bench' + (showBenefits ? ' wide' : '')}>
    <div className="wl-figure">
      <svg className={'wl-body ' + size} viewBox="0 0 120 170" role="img"
        aria-label={t('{0} of {1} ml, {2}%', fmtNum(m), fmtNum(g), fmtNum(Math.round(pct * 100)))}>
        <defs>
          {/* The union of the four shapes: what counts as "inside the body". */}
          <clipPath id={id + 'b'} clipPathUnits="userSpaceOnUse">{shapes}</clipPath>
          {/* And again, below the water line — so a bubble that has risen past it disappears
              instead of floating in mid-air. Nested clips intersect. */}
          <clipPath id={id + 'w'} clipPathUnits="userSpaceOnUse">
            <rect x="0" y={top} width="120" height={Math.max(0, 170 - top)} />
          </clipPath>
        </defs>

        <g className="wl-body-shell">{shapes}</g>

        {pct > 0 && <g clipPath={`url(#${id}b)`}>
          <rect className="wl-body-fill" x="0" y={top} width="120" height={170 - top} />
          <rect className="wl-body-surface" x="0" y={top - 1.2} width="120" height="2.4" />
          {size === 'lg' && pct < 1 && <g clipPath={`url(#${id}w)`}>
            {BUBBLES.map(([cx, delay], i) => (
              <circle key={i} className="wl-bubble" cx={cx} cy={150} r="2.6"
                style={{ animationDelay: `${delay}s` }} />
            ))}
          </g>}
        </g>}

        {showBenefits && !compact && BEN.map(b => {
          const on = pct >= b.need
          return <g key={b.title} className={'wl-body-leaders' + (on ? ' on' : '')} aria-hidden="true">
            <circle cx={b.x} cy={b.y} r="2.4" />
            <path d={`M${b.x} ${b.y}H110`} />
            <path d={`M106 ${b.y - 3}L110 ${b.y}L106 ${b.y + 3}`} />
          </g>
        })}

        <g className="wl-body-line">{shapes}</g>
      </svg>
      <span className="wl-pct">{fmtNum(Math.round(pct * 100))}%</span>
    </div>

    <div className="wl-detail">
      <div className="wl-detail-main">
        {pct >= 1 ? t('Goal reached') : t('{0} ml to go', fmtNum(left))}
      </div>
      {showBenefits && <ul className={'wl-bench-list' + (compact ? ' compact' : '')}>
        {BEN.map(b => {
          const on = pct >= b.need
          return <li key={b.title} className={'wl-bench-row' + (on ? ' on' : '')}>
            <span className="wl-bench-dot" aria-hidden="true" />
            <div>
              <div className="wl-bench-title">{b.title}</div>
              {!compact && <div className="wl-bench-note dim">{b.note}</div>}
            </div>
          </li>
        })}
      </ul>}
    </div>
  </div>
}