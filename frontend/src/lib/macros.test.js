import { describe, expect, it } from 'vitest'
import {
  FAT_FLOOR_PER_KG, KCAL_PER_KG, PROTEIN_FLOOR, RATE_BAND, activityFactor, bmrOf, clampGoal, fromKg,
  macroPlan, maintenanceOf, modeOf, sessionsPerWeek, toKg,
} from './macros.js'

// One real profile to reason about: 80 kg, 180 cm, 30, training four times a week.
const LEO = { weightKg: 80, heightCm: 180, age: 30, body: 'male', sessionsPerWeek: 4 }

describe('resting burn', () => {
  it('is Mifflin-St Jeor, checked against the published figures', () => {
    // 10x80 + 6.25x180 - 5x30 + 5
    expect(bmrOf(LEO)).toBe(1780)
    // The female constant is 166 lower.
    expect(bmrOf({ ...LEO, body: 'female' })).toBe(1614)
  })

  it('says what it is missing rather than guessing', () => {
    expect(bmrOf({ ...LEO, heightCm: 0 })).toBeNull()
    expect(bmrOf({ ...LEO, age: null })).toBeNull()
    expect(bmrOf({ ...LEO, weightKg: 0 })).toBeNull()
  })

  it('scales it by how often the profile actually trains', () => {
    expect(activityFactor(0)).toBe(1.45)
    expect(activityFactor(2)).toBe(1.55)
    expect(activityFactor(4)).toBe(1.70)
    expect(activityFactor(6)).toBe(1.75)
    const { bmr, maintenance } = maintenanceOf(LEO)
    expect(maintenance).toBe(Math.round(bmr * 1.70))
  })
})

describe('sessions a week', () => {
  it('counts each day once, across the window asked for', () => {
    // 12 sessions over 8 weeks.
    const workouts = Array.from({ length: 12 }, (_, i) => ({ d: `2026-09-${String(i + 1).padStart(2, '0')}` }))
    expect(sessionsPerWeek(workouts, 8, Date.now(), '2026-09-30')).toBeCloseTo(1.5, 5)
  })

  it('is zero for a profile that has never logged a session', () => {
    expect(sessionsPerWeek([], 8)).toBe(0)
    expect(sessionsPerWeek(undefined, 8)).toBe(0)
  })

  it('leaves out what fell out of the window', () => {
    const old = [{ d: '2025-01-01' }, { d: '2025-01-02' }]
    expect(sessionsPerWeek(old, 8, Date.now(), '2026-10-21')).toBe(0)
  })
})

describe('the plan for a goal', () => {
  it('takes a fifth off maintenance to lose weight, and adds a tenth to gain', () => {
    const { maintenance } = maintenanceOf(LEO)          // 3026
    expect(macroPlan({ ...LEO, mode: 'cut' })).toMatchObject({ kcal: 2420, maintenance })
    expect(macroPlan({ ...LEO, mode: 'bulk' })).toMatchObject({ kcal: 3330, maintenance })
    // Holding steady is maintenance itself, rounded to a number you can actually eat.
    expect(macroPlan({ ...LEO, mode: 'maintain' }).kcal).toBe(3030)
  })

  it('holds protein at the floor the goal calls for', () => {
    expect(macroPlan({ ...LEO, mode: 'cut' }).p).toBe(160)       // 2.0 g/kg
    expect(macroPlan({ ...LEO, mode: 'bulk' }).p).toBe(130)      // 1.6 g/kg, rounded to 5 g
    expect(macroPlan({ ...LEO, mode: 'maintain' }).p).toBe(110)  // 1.4 g/kg
    expect(PROTEIN_FLOOR.cut).toBeGreaterThan(PROTEIN_FLOOR.bulk)
  })

  it('never drops fat below the hormonal floor', () => {
    const plan = macroPlan({ ...LEO, mode: 'cut' })
    expect(plan.f).toBe(Math.round(FAT_FLOOR_PER_KG * 80 / 5) * 5)
  })

  it('gives carbohydrate the remainder, and never a negative one', () => {
    const plan = macroPlan({ ...LEO, mode: 'cut' })
    expect(plan.c).toBe(335)
    // The four numbers add back up to the calorie target.
    expect(plan.p * 4 + plan.c * 4 + plan.f * 9).toBeGreaterThanOrEqual(plan.kcal - 25)
    expect(plan.p * 4 + plan.c * 4 + plan.f * 9).toBeLessThanOrEqual(plan.kcal + 25)
  })

  it('keeps every derived target above the calorie floor and the resting burn', () => {
    const light = { weightKg: 55, heightCm: 160, age: 25, body: 'female', sessionsPerWeek: 1 }
    for (const profile of [LEO, light]) {
      for (const mode of ['cut', 'maintain', 'bulk']) {
        const plan = macroPlan({ ...profile, mode })
        expect(plan.kcal).toBeGreaterThanOrEqual(plan.floor.kcal)
        expect(plan.kcal).toBeGreaterThanOrEqual(plan.bmr)
        expect(plan.kcal).toBeGreaterThanOrEqual(plan.maintenance * 0.75)
      }
    }
    // And the floor never actually binds: a 20% deficit is deliberately gentler than the 25% the
    // floor allows. Choosing "lose weight" must not quietly hand back the bare minimum.
    const cut = macroPlan({ ...light, mode: 'cut' })
    expect(cut.kcal).toBeGreaterThan(cut.floor.kcal)
    expect(cut.kcal).toBe(Math.round(cut.maintenance * 0.8 / 10) * 10)
  })

  it('predicts the weight change through the body\'s energy density, not raw arithmetic', () => {
    const plan = macroPlan({ ...LEO, mode: 'cut' })
    expect(plan.perWeek).toBe(-0.55)
    expect(plan.perWeekPct).toBe(0.69)
    // The crude reading would be (2420 - 3026) * 7 / 1000 = -4.24 kg/week, which is not a rate
    // anyone loses weight at; 7700 kcal a kilo is what makes it land where it should.
    expect(Math.abs(plan.perWeek)).toBeLessThan(1)
    expect(KCAL_PER_KG).toBe(7700)
  })

  it('paces both goals inside the range a coach would stand behind', () => {
    // Bounding the energy shift to -20%/+10% is what buys this: the implied rate cannot walk
    // out of the 0.5-1% band, so there is no "losing too fast" warning to raise.
    const cut = macroPlan({ ...LEO, mode: 'cut' })
    expect(cut.perWeek).toBeLessThan(0)
    expect(cut.perWeekPct).toBeGreaterThan(RATE_BAND.min * 100)
    expect(cut.perWeekPct).toBeLessThan(RATE_BAND.max * 100)

    const bulk = macroPlan({ ...LEO, mode: 'bulk' })
    expect(bulk.perWeek).toBeGreaterThan(0)
    expect(bulk.perWeekPct).toBeLessThan(RATE_BAND.max * 100)

    // Holding steady moves nothing at all.
    expect(macroPlan({ ...LEO, mode: 'maintain' }).perWeek).toBe(0)
  })

  it('estimates the weeks to a goal weight when the plan points at it', () => {
    const plan = macroPlan({ ...LEO, mode: 'cut', targetW: 75, unit: 'kg' })
    expect(plan.etaWeeks).toBe(9)                       // 5 kg at 0.55 kg/week
  })

  it('gives no estimate when the plan moves away from the goal, or there is none', () => {
    expect(macroPlan({ ...LEO, mode: 'cut', targetW: 85, unit: 'kg' }).etaWeeks).toBeNull()
    expect(macroPlan({ ...LEO, mode: 'cut' }).etaWeeks).toBeNull()
    expect(macroPlan({ ...LEO, mode: 'maintain', targetW: 75 }).etaWeeks).toBeNull()
  })

  it('needs a weigh-in, a height and an age before it can plan', () => {
    expect(macroPlan({ ...LEO, heightCm: 0 })).toMatchObject({ ok: false, needs: ['height'] })
    expect(macroPlan({ ...LEO, age: 0, heightCm: 0 }).needs).toEqual(['height', 'age'])
    expect(macroPlan({ ...LEO, weightKg: 0 }).needs).toEqual(['weight'])
    expect(macroPlan({ weightKg: 0, heightCm: 0, age: 0 }).needs).toEqual(['weight', 'height', 'age'])
  })

  it('treats an unknown goal as "hold steady" rather than failing', () => {
    expect(modeOf('nonsense').id).toBe('maintain')
    expect(macroPlan({ ...LEO, mode: 'nonsense' }).kcal).toBe(macroPlan({ ...LEO, mode: 'maintain' }).kcal)
  })
})

describe('a hand-typed goal', () => {
  const plan = macroPlan({ ...LEO, mode: 'cut' })

  it('is left alone when it clears the floor', () => {
    expect(clampGoal(2600, plan, 'kcal')).toEqual({ value: 2600, floor: plan.floor.kcal, raised: false })
    expect(clampGoal(180, plan, 'p')).toEqual({ value: 180, floor: plan.floor.p, raised: false })
  })

  it('is raised to the floor when it is under it, and reports that it was', () => {
    // This is the floor's actual job. The derived plan never sits on it — a typed number can.
    const low = clampGoal(1200, plan, 'kcal')
    expect(low.value).toBe(plan.floor.kcal)
    expect(low.raised).toBe(true)
    expect(clampGoal(90, plan, 'p')).toMatchObject({ value: plan.floor.p, raised: true })
    expect(clampGoal(30, plan, 'f')).toMatchObject({ value: plan.floor.f, raised: true })
  })

  it('rounds to something you can actually weigh out', () => {
    expect(clampGoal(2437, plan, 'kcal').value % 10).toBe(0)
    expect(clampGoal(163, plan, 'p').value % 5).toBe(0)
  })

  it('is left as "no goal" for an empty field', () => {
    expect(clampGoal('', plan, 'kcal')).toBeNull()
    expect(clampGoal(null, plan, 'p')).toBeNull()
    expect(clampGoal(0, plan, 'kcal')).toBeNull()
  })

  it('falls back to no floor when there is no plan yet', () => {
    expect(clampGoal(1500, { ok: false }, 'kcal')).toEqual({ value: 1500, floor: null, raised: false })
  })
})

describe('units', () => {
  it('plans the same for the same body in kg or lb', () => {
    expect(toKg(176, 'lb')).toBeCloseTo(79.83, 2)
    expect(fromKg(80, 'lb')).toBeCloseTo(176.37, 2)
    const asKg = macroPlan({ ...LEO, mode: 'cut' })
    const asLb = macroPlan({ ...LEO, weightKg: toKg(176, 'lb'), mode: 'cut' })
    expect(Math.abs(asKg.kcal - asLb.kcal)).toBeLessThan(30)
  })

  it('reads a goal weight in the profile\'s own unit when estimating the weeks', () => {
    const inLb = macroPlan({ ...LEO, mode: 'cut', targetW: 165.4, unit: 'lb' })
    expect(inLb.etaWeeks).toBe(macroPlan({ ...LEO, mode: 'cut', targetW: 75, unit: 'kg' }).etaWeeks)
  })
})