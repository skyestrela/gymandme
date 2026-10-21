import { describe, expect, it } from 'vitest'
import { countChanges, syncFingerprint } from './sync-changes.js'
import { mergeDeletions, mergeStates, stampDeletions } from './sync-merge.js'
import * as API from '../../../api/sync-stamps.js'

const clone = v => JSON.parse(JSON.stringify(v))
const T = 1_800_000_000_000

describe('daily essentials survive a merge between devices', () => {
  const base = () => ({
    _ts: T,
    unit: 'kg',
    workouts: [],
    routines: [],
    week: {},
    water: [{ d: '2026-10-21', ml: 1000, t: T }],
    food: [],
    fastLog: [],
  })

  it('keeps a day of water removed on one device off the other', () => {
    // A had the day and cleared it; B never heard, and is newer as a whole.
    const A = stampDeletions(base(), { ...base(), water: [] }, T + 10)
    const B = { ...base(), _ts: T + 5 }
    expect(mergeStates(A, B).water).toEqual([])
    expect(mergeStates(B, A).water).toEqual([])
  })

  it('keeps a day put back after a removal', () => {
    const A = stampDeletions(base(), { ...base(), water: [] }, T + 10)
    const B = { ...base(), _ts: T + 5 }
    const C = stampDeletions(B, { ...base(), water: [{ d: '2026-10-21', ml: 1500, t: T + 40 }] }, T + 40)
    expect(mergeStates(A, C).water).toEqual([{ d: '2026-10-21', ml: 1500, t: T + 40 }])
  })

  it('takes the later total when both devices logged the same day', () => {
    const A = { ...base(), _ts: T + 5, water: [{ d: '2026-10-21', ml: 1000, t: T }] }
    const B = { ...base(), _ts: T + 1, water: [{ d: '2026-10-21', ml: 1750, t: T + 30 }] }
    expect(mergeStates(A, B).water).toEqual([{ d: '2026-10-21', ml: 1750, t: T + 30 }])
    expect(mergeStates(B, A).water).toEqual([{ d: '2026-10-21', ml: 1750, t: T + 30 }])
  })

  it('keeps days only one device logged', () => {
    const A = { ...base(), _ts: T + 5, water: [{ d: '2026-10-20', ml: 2000, t: T }] }
    const B = { ...base(), _ts: T + 1, water: [{ d: '2026-10-21', ml: 1000, t: T }] }
    expect(mergeStates(A, B).water.map(e => e.d)).toEqual(['2026-10-20', '2026-10-21'])
  })

  it('unions food logged on both devices, and keeps the version edited last', () => {
    const egg = { id: 'e1', d: '2026-10-21', at: T - 36e5, name: 'Eggs', kcal: 180, p: 12, c: 1, f: 13, _ts: T }
    const oats = { id: 'o1', d: '2026-10-21', at: T - 30e5, name: 'Oats', kcal: 400, p: 20, c: 55, f: 8, _ts: T }
    const A = { ...base(), _ts: T + 5, food: [clone(egg)] }
    const B = { ...base(), _ts: T + 1, food: [clone(oats)] }
    expect(mergeStates(A, B).food.map(f => f.id).sort()).toEqual(['e1', 'o1'])

    const fixed = { ...egg, kcal: 220, _ts: T + 50 }
    const C = { ...base(), _ts: T + 1, food: [clone(fixed)] }
    expect(mergeStates(A, C).food[0].kcal).toBe(220)
  })

  it('keeps a logged food removed on one device off the other', () => {
    const egg = { id: 'e1', d: '2026-10-21', at: T - 36e5, name: 'Eggs', kcal: 180, p: 12, c: 1, f: 13, _ts: T }
    const A = stampDeletions({ ...base(), food: [clone(egg)] }, { ...base(), food: [] }, T + 10)
    const B = { ...base(), _ts: T + 5, food: [clone(egg)] }
    expect(mergeStates(A, B).food).toEqual([])
    expect(mergeStates(B, A).food).toEqual([])
  })

  it('unions completed fasts the same way', () => {
    const f1 = { id: 'f1', d: '2026-10-20', h: 17, goal: 16, preset: '16:8', hit: true, _ts: T }
    const f2 = { id: 'f2', d: '2026-10-21', h: 9, goal: 20, preset: '20:4', hit: false, _ts: T }
    const A = { ...base(), _ts: T + 5, fastLog: [clone(f1)] }
    const B = { ...base(), _ts: T + 1, fastLog: [clone(f2)] }
    expect(mergeStates(A, B).fastLog.map(f => f.id).sort()).toEqual(['f1', 'f2'])
  })

  it('agrees with the server on the records of removals for these fields', () => {
    const a = { water: { '2026-10-21': T + 10 }, food: { e1: -(T + 10) }, fastLog: { f1: T + 10 } }
    const b = { water: { '2026-10-21': -(T + 20) }, food: {}, fastLog: { f1: -(T + 30) } }
    expect(mergeDeletions(a, b)).toEqual(API.mergeDeletions(a, b))
    expect(mergeDeletions(a, b)).toEqual({
      water: { '2026-10-21': -(T + 20) },
      food: { e1: -(T + 10) },
      fastLog: { f1: -(T + 30) },
    })
  })
})

describe('pending-change count', () => {
  it('counts a glass of water as one change, and the rest of the document stays one', () => {
    const before = syncFingerprint({ water: [], food: [], fastLog: [], restSec: 90 })
    const after = syncFingerprint({ water: [{ d: '2026-10-21', ml: 250, t: T }], food: [], fastLog: [], restSec: 90 })
    expect(countChanges({ water: [{ d: '2026-10-21', ml: 250, t: T }], food: [], fastLog: [], restSec: 90 }, before)).toBe(1)
    expect(after.wa['2026-10-21']).toBeTruthy()
  })

  it('counts a logged food and a finished fast too', () => {
    const S0 = { water: [], food: [], fastLog: [], restSec: 90 }
    const fp = syncFingerprint(S0)
    expect(countChanges({ ...S0, food: [{ id: 'e1' }] }, fp)).toBe(1)
    expect(countChanges({ ...S0, fastLog: [{ id: 'f1' }] }, fp)).toBe(1)
  })
})