import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FAST, FAST_PRESETS, WATER_DEFAULT_GOAL, WATER_MAX,
  addFood, fastElapsedMs, fastGoalMs, fastHitGoal, fastHoursOn, fastOn, fastPreset, fastRemainingMs,
  fastSeries, fastStreak, foodEntry, foodOn, foodSeries, foodTotal, goalOf, isFasting, lastDays,
  profilePlan, macroShare, recentFoods, removeFood, startFast, stopFast, updateFood, waterAdd,
  waterGoalFor, waterGoalOf, waterOn, waterPace, waterRemaining, waterSeries, waterSet,
  waterStreak, waterTotal, dayOrdinal, waterLineFor, WATER_LINES, waterBenefits } from './wellness.js'


// Day ordinal -> ISO, for the tests that walk consecutive days.
const isoDay = n => {
  const ms = Date.UTC(1970, 0, 1) + n * 86400000
  const d = new Date(ms)
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0')
}

describe('water', () => {
  it('keeps one entry per day, so a second log changes that day instead of stacking', () => {
    let w = waterSet([], '2026-10-21', 500)
    w = waterAdd(w, '2026-10-21', 250)
    w = waterAdd(w, '2026-10-21', 500)
    expect(w).toEqual([{ d: '2026-10-21', ml: 1250, t: expect.any(Number) }])
    expect(waterTotal(w, '2026-10-21')).toBe(1250)
  })

  it('rounds to whole 10 ml and never goes negative', () => {
    expect(waterSet([], '2026-10-21', 333).map(e => e.ml)).toEqual([330])
    const w = waterAdd(waterSet([], '2026-10-21', 200), '2026-10-21', -500)
    expect(waterOn(w, '2026-10-21')).toBeNull()
    expect(waterTotal(w, '2026-10-21')).toBe(0)
  })

  it('drops a day set to zero rather than storing a zero', () => {
    const w = waterSet(waterSet([], '2026-10-21', 500), '2026-10-21', 0)
    expect(w).toEqual([])
  })

  it('caps a day at a plausible amount instead of taking a fat-fingered 40 L', () => {
    expect(waterSet([], '2026-10-21', 40000)[0].ml).toBe(WATER_MAX)
  })

  it('sorts by date and reads a missing day as zero', () => {
    const w = waterSet(waterSet([], '2026-10-23', 800), '2026-10-20', 300)
    expect(w.map(e => e.d)).toEqual(['2026-10-20', '2026-10-23'])
    expect(waterTotal(w, '2026-10-22')).toBe(0)
    expect(waterTotal(undefined, '2026-10-22')).toBe(0)
  })

  it('counts the streak of days that reached the goal', () => {
    const log = [
      { d: '2026-10-19', ml: 2000 },
      { d: '2026-10-20', ml: 2400 },
      { d: '2026-10-21', ml: 2500 },
    ]
    expect(waterStreak(log, 2000, '2026-10-21')).toBe(3)
    expect(waterStreak(log, 2600, '2026-10-21')).toBe(0)
    expect(waterStreak(log, 2000, '2026-10-22')).toBe(3)   // today is not over yet
    expect(waterStreak(log, 2000, '2026-10-23')).toBe(0)   // but the 22nd is a real miss, not a day in progress
  })

  it('breaks the streak across a month end', () => {
    const log = [{ d: '2026-09-30', ml: 2000 }, { d: '2026-10-01', ml: 2000 }, { d: '2026-10-02', ml: 2000 }]
    expect(waterStreak(log, 2000, '2026-10-02')).toBe(3)
  })

  it('has no streak without a goal', () => {
    expect(waterStreak([{ d: '2026-10-21', ml: 5000 }], 0)).toBe(0)
  })
})

describe('the goal a body of this weight actually needs', () => {
  const ROUTINE = { id: 'r1', name: 'Push', ex: [] }
  // A rest day by default: the weekday pointer is what makes a day a training day, and that is
  // what the allowance is supposed to key off.
  const at = (over = {}) => ({
    unit: 'kg', bodyweight: [{ d: '2026-10-20', w: 78.7, t: 1 }],
    routines: [ROUTINE], week: {}, dayPlan: {}, queue: null, ...over,
  })

  it('says nothing at all for a profile that has never weighed in', () => {
    expect(waterGoalFor({}, '2026-10-21')).toBeNull()
    expect(waterGoalFor({ ...at(), bodyweight: [] }, '2026-10-21')).toBeNull()
  })

  it('works the figure out from the weight, rounded to something you can drink', () => {
    const s = waterGoalFor(at(), '2026-10-21')
    expect(s.training).toBe(false)
    expect(s.kg).toBeCloseTo(78.7, 5)
    expect(s.ml).toBe(2600)                  // 78.7 x 33 = 2597, to the nearest 50
    expect(s.ml % 50).toBe(0)
  })

  it('adds the training allowance on a day with a session on it', () => {
    const dow = new Date('2026-10-21T12:00:00').getDay()   // 2026-10-21 is a Wednesday
    expect(waterGoalFor(at(), '2026-10-21').training).toBe(false)
    const training = waterGoalFor(at({ week: { [dow]: 'r1' } }), '2026-10-21')
    expect(training.training).toBe(true)
    expect(training.ml).toBe(3100)
    // The next day has no pointer, so it is the same profile back at the resting figure.
    expect(waterGoalFor(at({ week: { [dow]: 'r1' } }), '2026-10-22').ml).toBe(2600)
  })

  it('plans the same body in lb as in kg', () => {
    const kg = waterGoalFor(at(), '2026-10-21').ml
    const lb = waterGoalFor({ ...at(), unit: 'lb', bodyweight: [{ d: '2026-10-20', w: 173.4, t: 1 }] }, '2026-10-21')
    expect(Math.abs(lb.ml - kg)).toBeLessThan(150)
  })

  it('is a suggestion, so nothing here ever writes a goal', () => {
    const S = at()
    waterGoalFor(S, '2026-10-21')
    expect(S.waterGoal).toBeUndefined()
  })
})

describe('how the day is tracking', () => {
  const water = ml => [{ d: '2026-10-21', ml, t: 1 }]

  it('counts what is still to go, and goes negative once the goal is passed', () => {
    expect(waterRemaining(water(500), 2000, '2026-10-21')).toBe(1500)
    expect(waterRemaining(water(2000), 2000, '2026-10-21')).toBe(0)
    expect(waterRemaining(water(2500), 2000, '2026-10-21')).toBe(-500)
    expect(waterRemaining(water(500), 0, '2026-10-21')).toBe(0)
  })

  it('says nothing early, because nobody is behind at breakfast', () => {
    const five = new Date(2026, 9, 21, 5, 0, 0).getTime()
    expect(waterPace(water(0), 2000, '2026-10-21', five).quiet).toBe(true)
    // Six in the morning is a quarter of the day gone, and by then it is worth saying.
    const six = new Date(2026, 9, 21, 6, 0, 0).getTime()
    expect(waterPace(water(0), 2000, '2026-10-21', six).quiet).toBe(false)
  })

  it('measures against the part of the day that has gone, not the whole goal', () => {
    // Noon is half the day, so half the goal is what is due by then.
    const noon = new Date(2026, 9, 21, 12, 0, 0).getTime()
    expect(waterPace(water(1000), 2000, '2026-10-21', noon).behind).toBe(0)
    expect(waterPace(water(200), 2000, '2026-10-21', noon).behind).toBe(800)
    expect(waterPace(water(3000), 2000, '2026-10-21', noon).behind).toBe(0)
    // Six in the evening is three quarters: 1500 ml due.
    const evening = new Date(2026, 9, 21, 18, 0, 0).getTime()
    expect(waterPace(water(0), 2000, '2026-10-21', evening).expected).toBe(1500)
  })
})

describe('fasting', () => {
  const NOW = new Date(2026, 9, 21, 12, 0, 0).getTime()   // 2026-10-21 12:00 local
  const hoursAgo = h => NOW - h * 3600e3

  it('falls back to the default preset for an unknown or missing id', () => {
    expect(fastPreset('20:4').fastH).toBe(20)
    expect(fastPreset('nonsense').id).toBe(DEFAULT_FAST)
    expect(fastPreset(undefined).id).toBe(DEFAULT_FAST)
    // Whatever the fallback lands on, it must still be a real entry, or a hand-edited
    // stored preset would render an undefined length in the sheet.
    expect(FAST_PRESETS.some(p => p.id === fastPreset('nonsense').id)).toBe(true)
  })

  it('gives every window a note to show, because the sheet renders it', () => {
    for (const p of FAST_PRESETS) {
      expect(typeof p.note).toBe('string')
      expect(p.note.trim().length).toBeGreaterThan(0)
    }
  })

  it('measures a running fast against its preset', () => {
    const f = startFast('16:8', hoursAgo(10))
    const after17 = hoursAgo(10) + 17 * 3600e3
    expect(isFasting(f)).toBe(true)
    expect(fastElapsedMs(f, NOW)).toBe(10 * 3600e3)
    expect(fastGoalMs(f)).toBe(16 * 3600e3)
    expect(fastRemainingMs(f, NOW)).toBe(6 * 3600e3)
    expect(fastHitGoal(f, NOW)).toBe(false)
    expect(fastHitGoal(f, after17)).toBe(true)
    expect(fastRemainingMs(f, after17)).toBe(0)
  })

  it('reads nothing as running when no fast is', () => {
    for (const none of [null, undefined, {}, { preset: '16:8', startedAt: 0 }]) {
      expect(isFasting(none)).toBe(false)
      expect(fastElapsedMs(none, NOW)).toBe(0)
      expect(fastHitGoal(none, NOW)).toBe(false)
      expect(stopFast(none, NOW)).toBeNull()
    }
  })

  it('never counts a fast that has not started yet', () => {
    expect(fastElapsedMs(startFast('16:8', NOW + 3600e3), NOW)).toBe(0)
  })

  it('records the fast on the day it ends, with the hours and whether it hit the target', () => {
    const done = stopFast(startFast('16:8', hoursAgo(17)), NOW)
    expect(done).toMatchObject({ d: '2026-10-21', h: 17, goal: 16, preset: '16:8', hit: true })
    const short = stopFast(startFast('20:4', hoursAgo(9)), NOW)
    expect(short).toMatchObject({ goal: 20, hit: false, h: 9 })
  })

  it('gives every fast an id so two on a day do not collide', () => {
    const a = stopFast(startFast('16:8', hoursAgo(20)), NOW)
    const b = stopFast(startFast('18:6', hoursAgo(5)), NOW)
    expect(a.id).not.toBe(b.id)
  })

  it('reads the fast and hours logged on a day', () => {
    const log = [stopFast(startFast('16:8', hoursAgo(17)), NOW)]
    expect(fastOn(log, '2026-10-21')?.h).toBe(17)
    expect(fastHoursOn(log, '2026-10-21')).toBe(17)
    expect(fastHoursOn(log, '2026-10-20')).toBe(0)
  })

  it('counts a streak of fasts that reached their target only', () => {
    const day = (d, h, hit) => ({ d, h, hit })
    const log = [day('2026-10-19', 17, true), day('2026-10-20', 9, false), day('2026-10-21', 16, true)]
    expect(fastStreak(log, '2026-10-21')).toBe(1)      // the 19th is cut off by the missed 20th
    expect(fastStreak(log, '2026-10-22')).toBe(1)
    expect(fastStreak([day('2026-09-30', 17, true), day('2026-10-01', 17, true)], '2026-10-01')).toBe(2)
  })
})

describe('food', () => {
  const at = (d, h) => new Date(`${d}T${String(h).padStart(2, '0')}:00`).getTime()

  it('keeps a day in the order it was eaten', () => {
    const f = [
      foodEntry({ name: 'Dinner', kcal: 600, d: '2026-10-21', at: at('2026-10-21', 20) }),
      foodEntry({ name: 'Breakfast', kcal: 400, d: '2026-10-21', at: at('2026-10-21', 8) }),
      foodEntry({ name: 'Yesterday', kcal: 900, d: '2026-10-20', at: at('2026-10-20', 12) }),
    ]
    expect(foodOn(f, '2026-10-21').map(e => e.name)).toEqual(['Breakfast', 'Dinner'])
  })

  it('totals calories and macros for the day', () => {
    const f = [
      foodEntry({ name: 'Oats', kcal: 400, p: 20, c: 55, f: 8, d: '2026-10-21' }),
      foodEntry({ name: 'Chicken', kcal: 500, p: 45, c: 5, f: 25, d: '2026-10-21' }),
    ]
    expect(foodTotal(f, '2026-10-21')).toEqual({ kcal: 900, p: 65, c: 60, f: 33, n: 2 })
    expect(foodTotal(f, '2026-10-22')).toEqual({ kcal: 0, p: 0, c: 0, f: 0, n: 0 })
  })

  it('works out the calories when only macros were given, and vice versa', () => {
    const macros = foodEntry({ name: 'Rice', p: 5, c: 50, f: 2 })
    expect(macros.kcal).toBe(238)     // 5x4 + 50x4 + 2x9
    const given = foodEntry({ name: 'Eggs', kcal: 180, p: 12, c: 1, f: 13 })
    expect(given.kcal).toBe(180)       // what was typed wins over what the macros work out to
  })

  it('refuses negative macros', () => {
    const e = foodEntry({ name: 'X', kcal: -50, p: -5, c: -5, f: -5 })
    expect(e).toMatchObject({ kcal: 0, p: 0, c: 0, f: 0 })
  })

  it('adds, edits and removes by id', () => {
    const a = foodEntry({ name: 'Eggs', kcal: 180 })
    let f = addFood([], a)
    const b = { ...a, kcal: 200 }
    f = updateFood(f, b)
    expect(foodTotal(f, a.d).kcal).toBe(200)
    f = removeFood(f, a.id)
    expect(f).toEqual([])
  })

  it('offers foods again, newest first, one row per name', () => {
    const f = [
      foodEntry({ name: 'Oats', kcal: 400, d: '2026-10-19', at: at('2026-10-19', 8) }),
      foodEntry({ name: 'Chicken', kcal: 500, d: '2026-10-21', at: at('2026-10-21', 19) }),
      foodEntry({ name: 'oats', kcal: 420, d: '2026-10-21', at: at('2026-10-21', 8) }),
    ]
    const recent = recentFoods(f, 10, '2026-10-21')
    expect(recent.map(r => r.name)).toEqual(['Chicken', 'oats'])   // 19:00 beats 08:00
    expect(recent[0]).toMatchObject({ kcal: 500, today: true })
    expect(recent[1]).toMatchObject({ kcal: 420, today: true })    // the later oats wins, under its own casing
  })

  it('shares energy between the macros', () => {
    expect(macroShare({ kcal: 100, p: 25, c: 0, f: 0 })).toEqual({ p: 1, c: 0, f: 0 })
    expect(macroShare({ kcal: 0, p: 0, c: 0, f: 0 })).toEqual({ p: 0, c: 0, f: 0 })
  })
})

describe('series', () => {
  it('walks back n days ending on the given day, oldest first', () => {
    expect(lastDays(3, '2026-10-21').map(d => d.d)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21'])
  })

  it('crosses a month end without losing or repeating a day', () => {
    expect(lastDays(4, '2026-10-02').map(d => d.d))
      .toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])
  })

  it('reads a day with nothing logged as zero, not as a gap', () => {
    const days = lastDays(3, '2026-10-21', d => (d === '2026-10-20' ? 800 : 0))
    expect(days.map(d => d.v)).toEqual([0, 800, 0])
  })

  it('will not build an unbounded chart', () => {
    expect(lastDays(9999, '2026-10-21')).toHaveLength(366)
    expect(lastDays(0, '2026-10-21')).toEqual([])
    expect(lastDays(-5, '2026-10-21')).toEqual([])
  })

  it('reads water, fasted hours and calories for the same days', () => {
    const water = [{ d: '2026-10-21', ml: 2000, t: 1 }, { d: '2026-10-19', ml: 1200, t: 1 }]
    const fastLog = [{ id: 'a', d: '2026-10-20', h: 17, hit: true }]
    const food = [{ id: 'b', d: '2026-10-21', at: 1, name: 'Oats', kcal: 400, p: 0, c: 0, f: 0 }]
    expect(waterSeries(water, 3, '2026-10-21').map(x => x.v)).toEqual([1200, 0, 2000])
    expect(fastSeries(fastLog, 3, '2026-10-21').map(x => x.v)).toEqual([0, 17, 0])
    expect(foodSeries(food, 3, '2026-10-21').map(x => x.v)).toEqual([0, 0, 400])
  })
})

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Four sessions a week for the last eight weeks - 32 trained days, which is what the
// activity factor in lib/macros.js reads as "four times a week".
const dayAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
const TRAINED = Array.from({ length: 32 }, (_, i) => ({ d: dayAgo(Math.floor((31 - i) * 50 / 31) + 1) }))

// The profile is 80 kg, 180 cm, 30, training four times a week, cutting to 75 kg.
const PROFILE = {
  unit: 'kg', body: 'male', bodyweight: [{ d: '2026-10-20', w: 80, t: 1 }],
  heightCm: 180, age: 30, macroMode: 'cut', targetW: 75, workouts: TRAINED,
}

describe('goals', () => {
  it('falls back to the default water goal', () => {
    expect(waterGoalOf({})).toBe(WATER_DEFAULT_GOAL)
    expect(waterGoalOf({ waterGoal: 3000 })).toBe(3000)
  })

  it('says what a profile is missing rather than planning around the gap', () => {
    expect(profilePlan({}).needs).toEqual(['weight', 'height', 'age'])
    expect(profilePlan({ ...PROFILE, bodyweight: [] }).needs).toEqual(['weight'])
    expect(profilePlan({ ...PROFILE, heightCm: 0, age: 0 }).needs).toEqual(['height', 'age'])
    expect(goalOf({}).kcal).toBeNull()
  })

  it('derives the targets from the weigh-in, the body and the training log', () => {
    const plan = profilePlan(PROFILE)
    expect(plan.bmr).toBe(1780)
    expect(plan.maintenance).toBe(3026)
    expect(goalOf(PROFILE)).toMatchObject({ kcal: 2420, p: 160, c: 335, f: 50, overridden: false })
  })

  it('holds steady until a goal is chosen, rather than putting anyone on a deficit', () => {
    expect(goalOf({ ...PROFILE, macroMode: null }).kcal).toBe(goalOf({ ...PROFILE, macroMode: 'maintain' }).kcal)
  })

  it('lets a hand-set number stand over the plan, and says that it did', () => {
    const g = goalOf({ ...PROFILE, macroGoal: { kcal: 2600 } })
    expect(g.kcal).toBe(2600)
    expect(g.p).toBe(160)            // everything else still falls out of the plan
    expect(g.overridden).toBe(true)
    expect(goalOf(PROFILE).overridden).toBe(false)
  })

  it('plans the same body in lb as in kg', () => {
    const lb = { ...PROFILE, unit: 'lb', bodyweight: [{ d: '2026-10-20', w: 176.4, t: 1 }], targetW: 165 }
    expect(Math.abs(goalOf(lb).kcal - goalOf(PROFILE).kcal)).toBeLessThan(30)
  })
})

describe('the day ordinal', () => {
  it('counts days from the epoch, from the parts alone', () => {
    expect(dayOrdinal('1970-01-01')).toBe(0)
    expect(dayOrdinal('2000-01-01')).toBe(10957)
    expect(dayOrdinal('2026-10-22')).toBe(20748)
  })

  it('steps by exactly one across day, month, year and leap boundaries', () => {
    for (const [a, b] of [
      ['2026-10-21', '2026-10-22'],
      ['2026-10-31', '2026-11-01'],
      ['2026-12-31', '2027-01-01'],
      ['2024-02-28', '2024-02-29'],
      ['2023-02-28', '2023-03-01'],
    ]) {
      expect(dayOrdinal(b) - dayOrdinal(a)).toBe(1)
    }
  })

  it('does not build a Date, so it cannot slip a day west of Greenwich', () => {
    // The whole reason this is not `new Date(iso)`: that parses as UTC.
    expect(String(dayOrdinal)).not.toContain('new Date')
    expect(String(dayOrdinal)).toContain('146097')
  })

  it('is 0 rather than NaN for something that is not a day', () => {
    for (const bad of ['', 'nonsense', null, undefined, '2026-13-45']) {
      expect(dayOrdinal(bad)).toBe(0)
    }
  })
})

describe("the day's line", () => {
  it('is always one of the lines, never undefined', () => {
    for (const d of ['2026-10-22', '1970-01-01', '2000-01-01', '1900-06-15']) {
      expect(WATER_LINES).toContain(waterLineFor(d))
    }
  })

  it('holds still for the whole day and does not reshuffle', () => {
    expect(waterLineFor('2026-10-22')).toBe(waterLineFor('2026-10-22'))
  })

  it('changes day to day', () => {
    // Consecutive days are not always the same line, or it would read as static.
    let changes = 0
    let d = dayOrdinal('2026-01-01')
    for (let i = 0; i < 40; i++) {
      if (waterLineFor(isoDay(d)) !== waterLineFor(isoDay(d + 1))) changes++
      d += 1
    }
    expect(changes).toBeGreaterThan(30)
  })

  it('cycles rather than running out, and covers every line', () => {
    expect(WATER_LINES.length).toBeGreaterThanOrEqual(8)
    const seen = new Set()
    for (let i = 0; i < WATER_LINES.length; i++) seen.add(waterLineFor(isoDay(dayOrdinal('2026-01-01') + i)))
    expect(seen.size).toBe(WATER_LINES.length)
  })

  it('survives a date before the epoch without indexing off the front', () => {
    expect(WATER_LINES).toContain(waterLineFor('1900-01-01'))
  })

  it('is the app\'s own words, with nobody\'s name on it', () => {
    // An invented attribution is worse than no line, so nothing here may look like a citation.
    WATER_LINES.forEach(l => expect(l).not.toMatch(/[—“”"]/))
    WATER_LINES.forEach(l => expect(l).not.toMatch(/—\s*[A-Z][a-z]+$/))
  })
})

describe('the benefits follow the goal', () => {
  it('keeps the first two rows the same whatever you are trying to do', () => {
    // Hydration does not care whether the goal is a deficit or a surplus.
    for (const mode of ['cut', 'maintain', 'bulk']) {
      const b = waterBenefits(mode)
      expect(b[0].title).toBe('Fewer headaches')
      expect(b[1].title).toBe('Clearer head')
    }
  })

  it('aims "less hungry" at a deficit, where it is the mechanism', () => {
    expect(waterBenefits('cut')[2].title).toBe('Less hungry')
    expect(waterBenefits('maintain')[2].title).toBe('Less hungry')
  })

  it('aims the third row the other way in a surplus', () => {
    // The commonest way a bulk fails is not eating enough, so "less hungry" would be
    // pointing at the wrong problem.
    expect(waterBenefits('bulk')[2].title).toBe('Easier to eat your surplus')
    expect(waterBenefits('bulk')[2].title).not.toBe('Less hungry')
  })

  it('unlocks at the same four quarters in every mode', () => {
    for (const mode of ['cut', 'maintain', 'bulk']) {
      expect(waterBenefits(mode).map(b => b.need)).toEqual([0.25, 0.50, 0.75, 1.00])
    }
  })

  it('gives the session row a different reason depending on the goal', () => {
    expect(waterBenefits('cut')[3].note).toContain('2%')
    expect(waterBenefits('bulk')[3].note).toContain('session')
    expect(waterBenefits('bulk')[3].note).not.toBe(waterBenefits('cut')[3].note)
  })

  it('says plainly that water does not build muscle', () => {
    // The one line in the app that must never overclaim.
    expect(waterBenefits('bulk')[3].note).toMatch(/does not build muscle/)
  })

  it('falls back to holding steady for a mode it does not recognise', () => {
    for (const odd of ['nonsense', undefined, null, '', 'BULK']) {
      expect(waterBenefits(odd).map(b => b.title))
        .toEqual(waterBenefits('maintain').map(b => b.title))
    }
  })

  it('always returns four rows with a title and a note', () => {
    for (const mode of ['cut', 'maintain', 'bulk']) {
      expect(waterBenefits(mode)).toHaveLength(4)
      waterBenefits(mode).forEach(b => {
        expect(b.title).toBeTruthy()
        expect(b.note).toBeTruthy()
      })
    }
  })
})

describe("the day's line follows the goal too", () => {
  it('says something specific to a bulk', () => {
    expect(waterLineFor('2026-10-22', 'bulk')).toBe('A surplus is only muscle if the training earns it.')
    expect(waterLineFor('2026-10-23', 'bulk')).toBe('The weight goes on. What it turns into is decided in the session.')
  })

  it('says something specific to a deficit', () => {
    expect(waterLineFor('2026-10-22', 'cut')).toBe('A deficit is easy. Holding your strength in it is not.')
    expect(waterLineFor('2026-10-23', 'cut')).toBe('Losing the weight is arithmetic. Keeping the muscle is the work.')
  })

  it('keeps the general pool when the goal is holding steady', () => {
    expect(WATER_LINES).toContain(waterLineFor('2026-10-22', 'maintain'))
    expect(WATER_LINES).toContain(waterLineFor('2026-10-22'))
  })

  it('never mixes a bulk line into a cut day', () => {
    const cut = ['A deficit is easy. Holding your strength in it is not.',
                 'Losing the weight is arithmetic. Keeping the muscle is the work.']
    const bulk = ['A surplus is only muscle if the training earns it.',
                  'The weight goes on. What it turns into is decided in the session.']
    for (let i = 0; i < 14; i++) {
      const d = isoDay(dayOrdinal('2026-10-01') + i)
      expect(cut).toContain(waterLineFor(d, 'cut'))
      expect(bulk).toContain(waterLineFor(d, 'bulk'))
    }
  })
})
