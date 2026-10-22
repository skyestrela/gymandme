/* Water, fasting and what you ate — the three numbers a training log cannot answer.
 *
 * One card, three rows, all of them today's. Quick taps (a glass, start/stop a fast, log a meal)
 * sit on the card because they are the whole point of it; anything more precise — setting the
 * day's total, correcting a meal, changing the fasting window — is a tap away in its own sheet,
 * the way the weigh-in is. Stats holds the charts.
 */

import { useEffect, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDur, fmtNum, todayISO } from '../lib/format.js'
import {
  DEFAULT_FAST, WATER_QUICK, fastElapsedMs, fastHitGoal, fastPreset, fastRemainingMs, fastStreak,
  fastSeries, foodSeries, foodTotal, goalOf, isFasting, startFast, stopFast, waterAdd,
  waterGoalOf, waterPace, waterSeries, waterSet, waterStreak, waterTotal, waterLineFor } from '../lib/wellness.js'
import { fastingSheet, foodSheet, macroSheet, waterSheet } from '../sheets.jsx'
import Icon from './Icon.jsx'
import WaterBody from './WaterBody.jsx'
import DayBars from './DayBars.jsx'
import { Button } from './ui.jsx'

// A fast is the only one of these that moves while the screen is still. Second by second while it
// runs, off the moment it stops: a timer that kept ticking over a closed sheet is a battery cost
// nobody asked for.
function useNow(on) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return undefined
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [on])
  return now
}

// The same thin bar the muscle rows use, freed from .mrow so the card can carry one under each row.
const Meter = ({ value, goal, color }) => (
  <div className="wl-bar" aria-hidden="true">
    <i style={{ width: `${goal > 0 ? Math.min(100, (value / goal) * 100) : 0}%`, background: color }} />
  </div>
)

const macroModeLabel = id => (id === 'cut' ? t('Lose weight') : id === 'bulk' ? t('Gain muscle') : t('Maintain'))

const Head = ({ icon, tint, label, right }) => (
  <div className="row between" style={{ gap: 8 }}>
    <div className="row" style={{ gap: 8, minWidth: 0 }}>
      <span className="lrow-i" style={{ background: tint }}><Icon name={icon} /></span>
      <span className="lbl2">{label}</span>
    </div>
    {right}
  </div>
)

export default function WellnessCard() {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const d = todayISO()

  const running = isFasting(S.fasting)
  const now = useNow(running)

  const wGoal = waterGoalOf(S)
  const ml = waterTotal(S.water, d)
  const wStreak = waterStreak(S.water, wGoal, d)
  const wPace = waterPace(S.water, wGoal, d)

  const kcal = foodTotal(S.food, d)
  const goal = goalOf(S)

  const preset = fastPreset(S.fasting?.preset || S.fastWindow)
  const elapsed = fastElapsedMs(S.fasting, now)
  const left = fastRemainingMs(S.fasting, now)
  const hit = fastHitGoal(S.fasting, now)
  const fStreak = fastStreak(S.fastLog, d)

  const addWater = q => {
    const before = ml
    update(s => { s.water = waterAdd(s.water, d, q) })
    useUI.getState().toast(t('{0} ml logged', fmtNum(q)), {
      action: t('Undo'),
      onAction: () => update(s => { s.water = waterSet(s.water, d, before) }),
    })
  }
  // Ending from the card is the same ending as the sheet: the entry is recorded, the running fast
  // is cleared, and the window it was on is remembered for the next one.
  // Starting from the card starts the window last chosen, in one tap — that is the whole reason a
  // fasting tracker lives on the front screen rather than in a sheet. Choosing a different window,
  // or logging a fast you forgot to start, is the sheet's job.
  const quickStart = () => update(s => { s.fasting = startFast(s.fastWindow || DEFAULT_FAST) })
  const endFast = () => update(s => {
    const done = stopFast(s.fasting)
    if (done) s.fastLog = [...(s.fastLog || []), done]
    if (s.fasting?.preset) s.fastWindow = s.fasting.preset
    s.fasting = null
  })

  return <div className="card">
    <div className="row between" style={{ marginBottom: 12 }}>
      <h2 style={{ margin: 0 }}>{t('Daily essentials')}</h2>
      <span className="dim small">{t('Today')}</span>
    </div>

    {/* ---- water ---- */}
    <div style={{ marginBottom: 16 }}>
      <Head
        icon="drop" tint="var(--blue)" label={t('Water')}
        right={<span className="small dim">{fmtNum(ml)} / {fmtNum(wGoal)} ml</span>}
      />
      <div style={{ marginTop: 10 }}><WaterBody ml={ml} goal={wGoal} size="sm" showBenefits compact /></div>

      <p className="wl-quip">{t(waterLineFor())}</p>
      {wPace.behind > 0 && <div className="dim small wl-pace" style={{ marginTop: 4 }}>
        {t('{0} ml behind for the time of day', fmtNum(wPace.behind))}
      </div>}
      <div className="row between" style={{ marginTop: 8, gap: 8 }}>
        <div className="chips" style={{ margin: 0 }}>
          {WATER_QUICK.map(q => (
            <button key={q} className="chip" onClick={() => addWater(q)}>+{fmtNum(q)}</button>
          ))}
          {ml > 0 && <button className="chip" onClick={waterSheet}>{t('Edit')}</button>}
        </div>
        {wStreak > 1 && <span className="dim small" style={{ whiteSpace: 'nowrap' }}>{t('{0} day streak', wStreak)}</span>}
      </div>

    </div>

    {/* ---- fasting ---- */}
    <div style={{ marginBottom: 16 }}>
      <Head icon="hourglass" tint="var(--orange)" label={t('Fasting')}
        right={<button className="chip" onClick={fastingSheet}>{preset.id}</button>} />
      {running ? <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline', marginTop: 4 }}>
          <span className="big">{fmtDur(elapsed)}</span>
          <span className="dim small">{hit ? t('Goal reached') : t('{0} to go', fmtDur(left))}</span>
        </div>
        <div style={{ marginTop: 8 }}><Meter value={Math.min(elapsed, preset.fastH * 3600e3)} goal={preset.fastH * 3600e3} color="var(--orange)" /></div>
      </> : <div className="small dim" style={{ marginTop: 2 }}>{t('Not fasting')}</div>}
      <div className="row between" style={{ marginTop: 8, gap: 8 }}>
        <Button size="sm" icon={running ? 'check' : 'play'} variant={running ? 'plain' : 'primary'}
          onClick={running ? endFast : quickStart}>
          {running ? t('End fast') : t('Start fast')}
        </Button>
        <div className="row" style={{ gap: 8 }}>
          {fStreak > 1 && <span className="dim small">{t('{0} day streak', fStreak)}</span>}
          {running && <Button size="sm" variant="ghost" onClick={fastingSheet}>{t('Edit')}</Button>}
        </div>
      </div>
    </div>

    {/* ---- calories + macros ---- */}
    <div>
      <Head icon="meal" tint="var(--acc)" label={t('Calories')}
        right={<button className={'chip nocap' + (goal.plan.ok ? ' on' : '')} onClick={macroSheet}>
          {goal.plan.ok ? macroModeLabel(goal.plan.mode) : t('Set your goal')}
        </button>} />
      <div className="row" style={{ gap: 6, alignItems: 'baseline', marginTop: 2 }}>
        <span className="wl-num">{fmtNum(kcal.kcal)}</span>{' '}
        <span className="dim small">{goal.kcal ? `/ ${fmtNum(goal.kcal)} kcal` : 'kcal'}</span>
      </div>
      {goal.plan.ok && <div className="dim small" style={{ marginTop: 2 }}>
        {goal.plan.perWeekPct > 0
          ? t('{0} a week · {1} kcal a day minimum', fmtNum(Math.abs(goal.plan.perWeek)) + ' ' + (S.unit || 'kg'), fmtNum(goal.plan.floor.kcal))
          : t('{0} kcal a day minimum', fmtNum(goal.plan.floor.kcal))}
      </div>}
      {kcal.n === 0 ? <div className="small dim" style={{ marginTop: 2 }}>{t('Nothing logged today')}</div> : (
        <div className="row" style={{ gap: 10, marginTop: 8 }}>
          {['p', 'c', 'f'].map((m, i) => (
            <div key={m} style={{ flex: 1, minWidth: 0 }}>
              <Meter value={kcal[m]} goal={goal[m] || 0} color={['var(--acc)', 'var(--blue)', 'var(--orange)'][i]} />
              <div className="dim small" style={{ marginTop: 4 }}>
                {[['p', t('Protein')], ['c', t('Carbs')], ['f', t('Fat')]][i][1]} {fmtNum(kcal[m])}{goal[m] ? ` / ${fmtNum(goal[m])}` : ''} g
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <Button size="sm" icon="plus" onClick={foodSheet}>{t('Log food')}</Button>
        {!goal.plan.ok && <Button size="sm" variant="ghost" icon="target" onClick={macroSheet}>{t('Set your goal')}</Button>}
      </div>
    </div>
  </div>
}

/** The thirty days of each of the three, as the long view. Nothing logged: no section at all. */
export function WellnessStats() {
  const S = useStore(s => s.S)
  const d = todayISO()
  const water = waterSeries(S.water, 30, d)
  const fasts = fastSeries(S.fastLog, 30, d)
  const kcal = foodSeries(S.food, 30, d)
  const logged = (S.water?.length || 0) + (S.fastLog?.length || 0) + (S.food?.length || 0)
  if (!logged) return null

  const wGoal = waterGoalOf(S)
  const kGoal = goalOf(S).kcal
  // Over the days actually logged: a month where you drank water every day but fasted once should
  // not report a fasting average of zero.
  const avgOf = days => {
    const seen = days.filter(x => x.v > 0)
    return seen.length ? seen.reduce((a, b) => a + b.v, 0) / seen.length : 0
  }
  const Block = ({ icon, tint, title, days, goal, color, unit }) => {
    const avg = avgOf(days)
    return <div style={{ marginBottom: 18 }}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="lrow-i" style={{ background: tint }}><Icon name={icon} /></span>
          <span className="ttl">{title}</span>
        </div>
        {avg > 0 && <span className="dim small">{t('{0} avg/day', fmtNum(Math.round(avg)) + (unit ? ' ' + unit : ''))}</span>}
      </div>
      <DayBars days={days} goal={goal} color={color} unit={unit} label={title} />
    </div>
  }

  return <div className="card">
    <h2 style={{ marginBottom: 12 }}>{t('Daily essentials')}</h2>
    {(S.water?.length || 0) > 0 && <Block icon="drop" tint="var(--blue)" title={t('Water')}
      days={water} goal={wGoal} color="var(--blue)" unit="ml" />}
    {(S.fastLog?.length || 0) > 0 && <Block icon="hourglass" tint="var(--orange)" title={t('Fasting')}
      days={fasts} goal={fastPreset(S.fastWindow).fastH} color="var(--orange)" unit="h" />}
    {(S.food?.length || 0) > 0 && <Block icon="meal" tint="var(--acc)" title={t('Calories')}
      days={kcal} goal={kGoal} color="var(--acc)" unit="kcal" />}
  </div>
}