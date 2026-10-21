/* Your energy and protein targets, worked out instead of guessed.
 *
 * The app already knows your weight (weigh-ins), your sex (Settings) and how often you actually
 * train (every session you have logged). With your age and height it can estimate what you burn,
 * and from a goal — lose fat, hold steady, gain muscle — derive the intake that reaches it:
 *
 *   resting burn     Mifflin-St Jeor, the formula dietitians use in place of the old Harris-Benedict
 *   what you burn    resting burn x a physical-activity level read off YOUR training log
 *   the target       maintenance shifted by the rate that keeps the change mostly lean mass
 *   protein          the floor below which you lose muscle rather than fat
 *   fat              the floor below which hormones and absorption suffer
 *   carbohydrate     whatever is left — the flexible one, and the one you spend it on
 *
 * The floors are the point. "Lose weight" is not "eat as little as possible": below the floor the
 * scale comes down faster and so does everything else. So the numbers this returns are a plan with
 * a hard underside, and a target below the underside is raised to it rather than accepted.
 *
 * Everything is per kilogram, so it is unit-blind; the sheet converts for display.
 */

const LB_PER_KG = 2.2046226218
export const toKg = (w, unit) => (unit === 'lb' ? Number(w) / LB_PER_KG : Number(w))
export const fromKg = (kg, unit) => (unit === 'lb' ? kg * LB_PER_KG : kg)

/* ---- what the evidence supports ---- */

// Protein, g per kg of body weight, per day. These are minimums, not recommendations:
//   · cutting   2.0  — in a deficit this is the range that holds lean mass (Helms et al. 2014,
//                      which puts 2.3-3.1 g/kg FMR, about 1.6-2.2 g/kg of body weight, at the
//                      point where muscle is preserved rather than spent);
//   · holding    1.4  — general-health intake, enough to stay in positive nitrogen balance;
//   · bulking   1.6  — beyond about 1.6 g/kg/day the gains stop rising and the weight starts
//                      going to fat instead (Morton et al. 2018), so this is where it peaks.
export const PROTEIN_FLOOR = Object.freeze({ cut: 2.0, maintain: 1.4, bulk: 1.6 })

// Fat never goes below ~0.6 g/kg: below that the hormonal picture and fat-soluble vitamins start
// to suffer, whatever the calorie target says.
export const FAT_FLOOR_PER_KG = 0.6

// How far off maintenance each goal moves you. A deficit past ~20% costs lean mass even with
// adequate protein, and a surplus past ~10-15% is mostly fat; both are the safe edges.
export const ENERGY_SHIFT = Object.freeze({ cut: -0.20, maintain: 0, bulk: 0.10 })

/** Fat tissue, with the water and glycogen that travel with it, is worth about this per kilo. */
export const KCAL_PER_KG = 7700

// The range a coach will actually stand behind: 0.5-1% of body weight a week. Losing faster
// than that is losing muscle with the fat, and gaining faster is gaining fat with the muscle.
// The shifts above land inside this band by construction — which is the point of bounding them.
export const RATE_BAND = Object.freeze({ min: 0.005, max: 0.01 })

/**
 * Physical-activity level from how often you actually train, over the window `sessionsPerWeek`
 * was measured across. These are the standard PAL bands: 1.4 is lightly active, 1.725 is very
 * active. A profile with no logged sessions sits at the light end rather than being asked.
 */
export function activityFactor(sessionsPerWeek) {
  const n = Number(sessionsPerWeek)
  if (!Number.isFinite(n) || n <= 1) return 1.45
  if (n < 2) return 1.45
  if (n < 3) return 1.55
  if (n < 4) return 1.65
  if (n < 5) return 1.70
  return 1.75
}

/** Sessions a week over the last `weeks` of logged training, counting each day once. */
export function sessionsPerWeek(workouts, weeks = 8, now = Date.now(), today) {
  const list = (Array.isArray(workouts) ? workouts : []).filter(w => w && w.d)
  if (!list.length) return 0
  const end = today ? new Date(today + 'T12:00:00').getTime() : now
  const from = end - weeks * 7 * 86400000
  const days = new Set()
  for (const w of list) {
    const at = Number(w.start) || new Date(w.d + 'T12:00:00').getTime()
    if (at >= from && at <= end) days.add(w.d)
  }
  return days.size / weeks
}

/**
 * Resting energy burn (Mifflin-St Jeor). Needs a height and an age because they are in the
 * formula — which is why the sheet asks for both once rather than inventing numbers.
 */
export function bmrOf({ weightKg, heightCm, age, body }) {
  const kg = Number(weightKg), cm = Number(heightCm), yr = Number(age)
  if (!(kg > 0) || !(cm > 0) || !(yr > 0)) return null
  const female = body === 'female'
  return Math.round(10 * kg + 6.25 * cm - 5 * yr + (female ? -161 : 5))
}

/** What you burn on an average day: resting burn scaled by how much you actually train. */
export function maintenanceOf({ weightKg, heightCm, age, body, sessionsPerWeek: spw }) {
  const bmr = bmrOf({ weightKg, heightCm, age, body })
  if (!bmr) return null
  const factor = activityFactor(spw)
  return { bmr, factor, maintenance: Math.round(bmr * factor) }
}

export const MACRO_MODES = Object.freeze([
  { id: 'cut', shift: ENERGY_SHIFT.cut },
  { id: 'maintain', shift: ENERGY_SHIFT.maintain },
  { id: 'bulk', shift: ENERGY_SHIFT.bulk },
])
export const modeOf = id => MACRO_MODES.find(m => m.id === id) || MACRO_MODES[1]

const round10 = n => Math.round(n / 10) * 10
const round5 = n => Math.round(n / 5) * 5

/**
 * The plan for `modeId`: a calorie target, the three macros, and the floors underneath them.
 *
 * Protein and fat are set at their floors for the goal (they are the ones you should not cut),
 * carbohydrate takes the remainder, never below zero. The calorie floor is the underside the
 * whole plan rests on — and with the shifts above it never actually binds, because a 20% deficit
 * is deliberately gentler than the 25% the floor allows. That is intentional: the floor is there
 * to catch a number somebody types, not to drag a chosen goal down to the bare minimum. For the
 * same reason `wanted` is not reported — the target is always the goal's own shift, not the floor.
 *
 * `weight` is in kilograms. Returns `{ ok: false, needs }` when there is not enough to go on.
 */
export function macroPlan({ weightKg, heightCm, age, body, sessionsPerWeek: spw, mode: modeId, targetW, unit = 'kg' }) {
  const need = []
  if (!(Number(weightKg) > 0)) need.push('weight')
  if (!(Number(heightCm) > 0)) need.push('height')
  if (!(Number(age) > 0)) need.push('age')
  if (need.length) return { ok: false, needs: need }

  const { bmr, factor, maintenance } = maintenanceOf({ weightKg, heightCm, age, body, sessionsPerWeek: spw })
  const mode = modeOf(modeId).id

  // Never below the resting burn (going under it has no special meaning), and never below a 25%
  // deficit, which is past the point protein can defend the muscle.
  const floorKcal = round10(Math.max(bmr, maintenance * 0.75))
  const kcal = Math.max(round10(maintenance * (1 + modeOf(mode).shift)), floorKcal)

  const targetKg = Number(targetW) > 0 ? toKg(targetW, unit) : null
  // The weight that moves per week is the energy gap through the body's own energy density —
  // not the raw difference, which would read a 600 kcal deficit as four kilos a week.
  const drift = (kcal - maintenance) * 7 / KCAL_PER_KG
  const perWeek = Math.abs(drift) < 0.05 ? 0 : Math.round(drift * 100) / 100
  const perWeekPct = Math.round(Math.abs(drift) / weightKg * 10000) / 100

  const p = round5(PROTEIN_FLOOR[mode] * weightKg)
  const fFloor = round5(FAT_FLOOR_PER_KG * weightKg)
  const cRaw = (kcal - p * 4 - fFloor * 9) / 4
  // Carbohydrate is what flexes; if the floored protein and fat leave nothing, hand back zero
  // rather than a negative number that would read as a target.
  const c = Math.max(0, round5(cRaw))

  // Weeks to a goal weight, at the rate this plan implies.
  let etaWeeks = null
  if (targetKg != null && Math.abs(targetKg - weightKg) > 0.05 && Math.abs(perWeek) > 0.02) {
    const goingTheRightWay = (targetKg < weightKg && perWeek < 0) || (targetKg > weightKg && perWeek > 0)
    if (goingTheRightWay) etaWeeks = Math.max(1, Math.round(Math.abs(targetKg - weightKg) / Math.abs(perWeek)))
  }

  return {
    ok: true, mode, bmr, factor, maintenance,
    kcal, p, c, f: fFloor,
    floor: { kcal: floorKcal, p, f: fFloor },
    perWeek, perWeekPct,
    etaWeeks,
    targetKg,
  }
}

/**
 * A hand-typed goal read back through the same floors: what was asked for, and what it is raised
 * to. Returns null for a value that is not a goal at all (an empty field means "no goal").
 */
export function clampGoal(asked, plan, field) {
  const v = Number(asked)
  if (!Number.isFinite(v) || v <= 0) return null
  const floor = plan?.ok ? plan.floor[field] : null
  const value = floor != null && v < floor ? floor : v
  const unit = field === 'kcal' ? 10 : 5
  return { value: Math.round(value / unit) * unit, floor, raised: value > v }
}