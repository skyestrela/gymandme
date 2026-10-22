/* Daily essentials: water, fasting and food.
 *
 * The three things a gym log cannot answer on its own — how much you drank, whether you held a
 * fast, and what you ate. They are per-day numbers like the weigh-in (one entry per local day,
 * sorted by date), so they chart, export and merge through the same machinery.
 *
 * A fast belongs to the day it ENDS. You stop eating at 20:00 on Monday and eat at noon on
 * Tuesday: that is a Tuesday fast, because the hours are only complete once you break it, and a
 * streak should count the day the promise was kept rather than the night it was made.
 *
 * Everything here is pure — a store update hands in the previous list and gets a new one back, so
 * a fast that is running is the only thing that reads the clock (and it takes `now`).
 */

import { isoOf, todayISO, uid } from './format.js'
import { effectiveRoutineIds, lastBW } from './history.js'
import { macroPlan, sessionsPerWeek, toKg } from './macros.js'

// `n` days from the local day `iso`. A Date built from the parts (not from the string, which
// parses as UTC and lands on the previous day west of Greenwich) is what keeps a streak honest
// across a month end and a clock change.
const dayStep = (iso, n) => {
  const [y, m, d] = String(iso).split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + n)
  return isoOf(dt)
}

/* ============================================================ water */

export const WATER_DEFAULT_GOAL = 2000   // ml — the usual "drink more" figure, editable in Settings
export const WATER_QUICK = [250, 500]     // the two buttons on the Home card
export const WATER_MIN = 0
export const WATER_MAX = 15000           // a day over 15 L is a typo, not a hydration record
const roundMl = n => Math.round(n / 10) * 10

/** The day's entry, or null. One per day: logging again changes that day, it does not stack. */
export function waterOn(water, d) {
  return (Array.isArray(water) ? water : []).find(e => e && e.d === d) || null
}

/** How much was logged on `d`, in ml. */
export function waterTotal(water, d) {
  const e = waterOn(water, d)
  const n = Number(e?.ml)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** `water` with `d` set to `ml`. A non-positive amount removes the day rather than storing a zero. */
export function waterSet(water, d, ml, at = Date.now()) {
  const rest = (Array.isArray(water) ? water : []).filter(e => e && e.d !== d)
  const n = roundMl(Math.min(WATER_MAX, Math.max(WATER_MIN, Number(ml) || 0)))
  const next = n > 0 ? [...rest, { d, ml: n, t: at }] : rest
  return next.sort((a, b) => (a.d < b.d ? -1 : 1))
}

/** `water` with `ml` more on `d`. Never below zero, so an over-tap undoes rather than goes negative. */
export function waterAdd(water, d, ml, at = Date.now()) {
  return waterSet(water, d, waterTotal(water, d) + (Number(ml) || 0), at)
}

/* ---- what this body actually needs ---- */

export const WATER_ML_PER_KG = 33          // mid of the usual 30-35 ml/kg a day
export const WATER_TRAINING_EXTRA = 500    // the allowance commonly added on a day you trained

/**
 * The goal this body's own weight suggests, or null with no weigh-in behind it.
 *
 * Offered, never applied. The sheet puts it to you and writes nothing until you tap it: a stored
 * goal is somebody's own number, and quietly replacing it would be the app deciding for them.
 * Training days are read from the plan, the same way Home decides whether to show a Start button.
 */
export function waterGoalFor(S, d = todayISO()) {
  const bw = S?.bodyweight?.length ? lastBW(S) : null
  if (!bw) return null
  const kg = toKg(bw.w, S?.unit)
  if (!(kg > 0)) return null
  // A profile with no routines cannot have a session today, and asking anyway would read
  // dayPlan/week/queue off a state that has not got them.
  const training = (S?.routines?.length || 0) > 0 && effectiveRoutineIds(S, d).length > 0
  const ml = Math.round((kg * WATER_ML_PER_KG + (training ? WATER_TRAINING_EXTRA : 0)) / 50) * 50
  return { ml, kg, training }
}

/** ml still to go on `d`. Negative once the day has passed the goal. */
export function waterRemaining(water, goal, d = todayISO()) {
  const g = Number(goal) || 0
  return g > 0 ? g - waterTotal(water, d) : 0
}

/**
 * How the day is tracking by now, against the part of it that has already gone.
 *
 * A day's goal is not all due by breakfast, so "behind" only means anything measured against the
 * fraction elapsed — the same reasoning the macro sheet uses when it reports a pace. Before a
 * quarter of the day has passed there is nothing worth saying: nobody is behind at 8am.
 */
export function waterPace(water, goal, d = todayISO(), now = Date.now()) {
  const g = Number(goal) || 0
  const remaining = waterRemaining(water, g, d)
  // Read off the day's own parts rather than `new Date(iso)`, which parses as UTC and lands a day
  // early west of Greenwich — the way a streak goes quietly wrong.
  const [y, m, dd] = String(d).split('-').map(Number)
  const frac = Math.min(1, Math.max(0, (now - new Date(y, m - 1, dd).getTime()) / 86400000))
  if (g <= 0 || frac < 0.25) return { behind: 0, expected: 0, remaining, quiet: true }
  const expected = Math.round(g * frac)
  return { behind: Math.max(0, expected - waterTotal(water, d)), expected, remaining, quiet: false }
}

/**
 * Days since 1970-01-01 for an ISO day, worked out from the parts alone.
 *
 * Deliberately no `new Date(iso)`: that parses as UTC and lands a day early west of
 * Greenwich, which would mean the line below quietly changed at a different hour for half
 * the planet. This is days_from_civil, arithmetically identical and Date-free.
 */
export function dayOrdinal(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''))
  if (!m) return 0
  const y = +m[1], mo = +m[2], da = +m[3]
  // A month or day that cannot exist is a bad key, not a day to be guessed at: without this
  // '2026-13-45' came back as a confident number three weeks into the future.
  if (mo < 1 || mo > 12 || da < 1 || da > 31) return 0
  const yy = y - (mo <= 2 ? 1 : 0)
  const era = Math.floor(yy / 400)
  const yoe = yy - era * 400
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + da - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

/**
 * One line a day, under the water row.
 *
 * The app's own words, not a quotation from anyone: there is nothing here to attribute,
 * because an invented attribution would be worse than no line at all. About the person and
 * the habit, never a promised health outcome. Chosen from the date rather than at random,
 * so it holds for the whole day and does not shuffle on re-render.
 */
export const WATER_LINES = [
  'You are not behind. You are drinking.',
  'Small choices, repeated, become who you are.',
  'You do not need a perfect day. You need the next glass.',
  'Discipline is deciding before you are tired.',
  'You are building a habit, not chasing a number.',
  'Progress is quiet. Keep going anyway.',
  'You showed up today. That is the whole trick.',
  'The person you are becoming starts with this glass.',
]

/** Today's line. */
export const waterLineFor = (d = todayISO()) => {
  const n = WATER_LINES.length
  // The double modulo keeps a pre-1970 date from indexing off the front of the array.
  return WATER_LINES[((dayOrdinal(d) % n) + n) % n]
}

/** Consecutive days up to today that reached `goal`, today excluded while it is still short. */
export function waterStreak(water, goal, d = todayISO()) {
  const g = Number(goal) || 0
  if (g <= 0) return 0
  const days = new Set((Array.isArray(water) ? water : [])
    .filter(e => e && Number(e.ml) >= g)
    .map(e => e.d))
  let n = 0
  let cursor = d
  // Today still in progress: a streak survives a day that is not over yet, so start from
  // yesterday when today has not reached the goal yet.
  if (!days.has(d)) cursor = dayStep(d, -1)
  for (let i = 0; i < 3650; i++) {
    if (!days.has(cursor)) break
    n++
    cursor = dayStep(cursor, -1)
  }
  return n
}

/* ============================================================ fasting */

export const FAST_PRESETS = [
  { id: '16:8', fastH: 16, eatH: 8 },
  { id: '18:6', fastH: 18, eatH: 6 },
  { id: '20:4', fastH: 20, eatH: 4 },
  { id: 'omad', fastH: 23, eatH: 1 },
]
export const DEFAULT_FAST = '16:8'

/** The preset with `id`, falling back to the default so an old or hand-edited value still works. */
export function fastPreset(id) {
  return FAST_PRESETS.find(p => p.id === id) || FAST_PRESETS[0]
}

/** The running fast to store: null when nothing is running. */
export function startFast(preset, at = Date.now()) {
  return { preset: fastPreset(preset).id, startedAt: at }
}

export function isFasting(fasting) {
  return !!(fasting && Number(fasting.startedAt) > 0)
}

/** How long the running fast has been going, in ms (0 when nothing is running). */
export function fastElapsedMs(fasting, now = Date.now()) {
  if (!isFasting(fasting)) return 0
  return Math.max(0, now - Number(fasting.startedAt))
}

/** The ms the preset asks for. */
export function fastGoalMs(fasting) {
  return fastPreset(fasting?.preset).fastH * 3600e3
}

/** How much longer the running fast needs; 0 once the goal is met. */
export function fastRemainingMs(fasting, now = Date.now()) {
  if (!isFasting(fasting)) return 0
  return Math.max(0, fastGoalMs(fasting) - fastElapsedMs(fasting, now))
}

/** Whether the running fast has reached its preset's target. */
export function fastHitGoal(fasting, now = Date.now()) {
  return isFasting(fasting) && fastElapsedMs(fasting, now) >= fastGoalMs(fasting)
}

/**
 * The log entry for ending the running fast, or null when nothing was running. The fast is
 * recorded on the day it ends; `hit` says whether it reached its own target.
 */
export function stopFast(fasting, now = Date.now()) {
  if (!isFasting(fasting)) return null
  const ms = fastElapsedMs(fasting, now)
  const goalMs = fastGoalMs(fasting)
  return {
    id: uid(),
    d: isoOf(new Date(now)),
    startedAt: Number(fasting.startedAt),
    endedAt: now,
    h: Math.round((ms / 3600e3) * 100) / 100,
    goal: fastPreset(fasting.preset).fastH,
    preset: fastPreset(fasting.preset).id,
    hit: ms >= goalMs,
    _ts: now,
  }
}

/** The completed fast recorded on `d`, or null. A day holds at most one. */
export function fastOn(fastLog, d) {
  return (Array.isArray(fastLog) ? fastLog : []).find(e => e && e.d === d) || null
}

/** Hours fasted on `d` (0 when nothing was logged). */
export function fastHoursOn(fastLog, d) {
  const n = Number(fastOn(fastLog, d)?.h)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Consecutive days up to today that completed a fast reaching its target. A day still running is
 * not counted, and does not break the streak either: the fast it will end today has not been
 * missed yet, so the run is read from yesterday when today is not logged.
 */
export function fastStreak(fastLog, d = todayISO()) {
  const days = new Set((Array.isArray(fastLog) ? fastLog : [])
    .filter(e => e && e.hit)
    .map(e => e.d))
  let n = 0
  let cursor = d
  if (!days.has(d)) cursor = dayStep(d, -1)
  for (let i = 0; i < 3650; i++) {
    if (!days.has(cursor)) break
    n++
    cursor = dayStep(cursor, -1)
  }
  return n
}

/* ============================================================ food */

/** The day's food, oldest first (a day reads as the order it was eaten). */
export function foodOn(food, d) {
  return (Array.isArray(food) ? food : [])
    .filter(e => e && e.d === d)
    .slice()
    .sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0))
}

const MACROS = ['kcal', 'p', 'c', 'f']
export const MACRO_LABEL = { kcal: 'kcal', p: 'g', c: 'g', f: 'g' }
export const MACRO_FACTOR = { kcal: 1, p: 4, c: 4, f: 9 }   // kcal per gram, for the energy share

const round1 = n => Math.round(n * 10) / 10

/** Calories and macros logged on `d`. */
export function foodTotal(food, d) {
  const out = { kcal: 0, p: 0, c: 0, f: 0, n: 0 }
  for (const e of foodOn(food, d)) {
    out.n++
    for (const m of MACROS) {
      const v = Number(e[m])
      if (Number.isFinite(v) && v > 0) out[m] += v
    }
    out.kcal = round1(out.kcal)
  }
  return out
}

/** A food entry, with an id and the energy it works out to when only macros were given. */
export function foodEntry({ name, kcal, p, c, f, d, at }) {
  const P = Math.max(0, Number(p) || 0)
  const C = Math.max(0, Number(c) || 0)
  const F = Math.max(0, Number(f) || 0)
  const given = Number(kcal)
  const derived = P * MACRO_FACTOR.p + C * MACRO_FACTOR.c + F * MACRO_FACTOR.f
  const cal = Number.isFinite(given) && given > 0 ? given : (derived > 0 ? round1(derived) : 0)
  return {
    id: uid(),
    d: d || todayISO(),
    at: Number(at) || Date.now(),
    name: String(name || '').trim(),
    kcal: round1(cal),
    p: round1(P),
    c: round1(C),
    f: round1(F),
    _ts: Date.now(),
  }
}

/** `food` with `entry` added (newest last). */
export function addFood(food, entry) {
  return [...(Array.isArray(food) ? food : []), entry]
}

/** `food` without `id`, plus a delete record the server keeps so another device's copy goes too. */
export function removeFood(food, id) {
  return (Array.isArray(food) ? food : []).filter(e => e && e.id !== id)
}

/** `food` with `entry` replaced by id (the edit path). */
export function updateFood(food, entry) {
  return (Array.isArray(food) ? food : []).map(e => (e && e.id === entry.id ? entry : e))
}

/**
 * Foods worth offering again, most recently logged first, each carrying the macros it was last
 * logged with. This is the quick-add list: what you eat repeats, so the second meal of a food you
 * already ate today is one tap rather than a form.
 */
export function recentFoods(food, limit = 12, d = todayISO()) {
  const byName = new Map()
  for (const e of (Array.isArray(food) ? food : [])) {
    const name = String(e?.name || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const prev = byName.get(key)
    if (prev && (Number(prev.at) || 0) >= (Number(e.at) || 0)) continue
    byName.set(key, { name, kcal: Number(e.kcal) || 0, p: Number(e.p) || 0, c: Number(e.c) || 0, f: Number(e.f) || 0, at: Number(e.at) || 0, d: e.d, today: e.d === d })
  }
  return [...byName.values()].sort((a, b) => b.at - a.at).slice(0, Math.max(0, limit))
}

/** Energy split of a day's macros as shares of `kcal` (or of the macros, when kcal is unknown). */
export function macroShare(total) {
  const fromMacros = total.p * MACRO_FACTOR.p + total.c * MACRO_FACTOR.c + total.f * MACRO_FACTOR.f
  const base = total.kcal > 0 ? total.kcal : fromMacros
  if (base <= 0) return { p: 0, c: 0, f: 0 }
  return {
    p: (total.p * MACRO_FACTOR.p) / base,
    c: (total.c * MACRO_FACTOR.c) / base,
    f: (total.f * MACRO_FACTOR.f) / base,
  }
}

/* ============================================================ series */

/**
 * The last `n` local days ending at `d`, oldest first, each `{ d, v }` with `v` read by `pick`.
 * A day with nothing logged is a zero, not a gap: a bar chart that skipped the days you did not
 * drink or fast would put the rest next to each other and read as a steady run.
 */
export function lastDays(n, d = todayISO(), pick = () => 0) {
  const out = []
  const count = Math.max(0, Math.min(366, Math.floor(n) || 0))
  for (let i = count - 1; i >= 0; i--) {
    const day = dayStep(d, -i)
    const v = Number(pick(day))
    out.push({ d: day, v: Number.isFinite(v) && v > 0 ? v : 0 })
  }
  return out
}

/** Daily water in ml over the last `n` days. */
export const waterSeries = (water, n = 30, d = todayISO()) => lastDays(n, d, day => waterTotal(water, day))

/** Hours fasted per day over the last `n` days. */
export const fastSeries = (fastLog, n = 30, d = todayISO()) => lastDays(n, d, day => fastHoursOn(fastLog, day))

/** Calories per day over the last `n` days. */
export const foodSeries = (food, n = 30, d = todayISO()) => lastDays(n, d, day => foodTotal(food, day).kcal)

/* ============================================================ goals */

export const DEFAULT_MACRO_GOAL = { kcal: null, p: null, c: null, f: null }

export const waterGoalOf = S => {
  const n = Number(S?.waterGoal)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : WATER_DEFAULT_GOAL
}

/**
 * The plan for the profile as stored (lib/macros.js): the last weigh-in, the sex from Settings,
 * how often the training log says you actually train, and the goal you picked. `S.macroMode` is
 * null until you choose one, and the plan falls back to holding steady until then — the sheet
 * asks rather than putting somebody on a deficit nobody asked for.
 */
export function profilePlan(S) {
  const bw = S?.bodyweight?.length ? lastBW(S) : null
  return macroPlan({
    weightKg: bw ? toKg(bw.w, S?.unit) : 0,
    heightCm: S?.heightCm,
    age: S?.age,
    body: S?.body,
    sessionsPerWeek: sessionsPerWeek(S?.workouts, 8),
    mode: S?.macroMode,
    targetW: S?.targetW,
    unit: S?.unit || 'kg',
  })
}

/**
 * The targets the day is measured against: the derived plan, with anything typed by hand on top.
 *
 * `S.macroGoal` is therefore an override and nothing else — it starts empty, and choosing a goal
 * clears it, so what you get is the plan unless you deliberately type over it. A value stored
 * there that sat under the plan's floor was already raised on the way in (macros.clampGoal), so
 * there is no way to end up here with a number the floor would refuse.
 */
export function goalOf(S) {
  const plan = profilePlan(S)
  const over = S?.macroGoal || {}
  const at = k => {
    const v = Number(over[k])
    if (Number.isFinite(v) && v > 0) return Math.round(v)
    return plan.ok ? plan[k] : null
  }
  return {
    kcal: at('kcal'), p: at('p'), c: at('c'), f: at('f'),
    plan,
    overridden: ['kcal', 'p', 'c', 'f'].some(k => Number(over[k]) > 0),
  }
}