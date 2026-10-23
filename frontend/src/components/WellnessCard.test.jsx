// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import WellnessCard from './WellnessCard.jsx'
import { WATER_LINES, waterLineFor } from '../lib/wellness.js'

const waterSheet = vi.fn()
const fastingSheet = vi.fn()
const foodSheet = vi.fn()
const macroSheet = vi.fn()
vi.mock('../sheets.jsx', () => ({
  waterSheet: (...a) => waterSheet(...a),
  fastingSheet: (...a) => fastingSheet(...a),
  foodSheet: (...a) => foodSheet(...a),
  macroSheet: (...a) => macroSheet(...a),
}))

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Four sessions a week for the last eight weeks - 32 trained days, which is what the
// activity factor in lib/macros.js reads as "four times a week".
const FROZEN = new Date(2026, 9, 21, 12, 0, 0)
// Anchored to FROZEN, not to the real calendar. TRAINED is built at import, before the fake
// timers are installed, so `new Date()` here slid the training log a day further into the
// future every time the suite ran while the window in sessionsPerWeek stayed pinned to
// FROZEN. One day at a time a session fell out of the eight-week window and every derived
// number moved with it: 32 days a week reads as 4x, 31 reads as 3.875. The suite passed for
// as long as the real date was at or before FROZEN, and then failed on its own.
const dayAgo = n => { const d = new Date(FROZEN); d.setDate(d.getDate() - n); return iso(d) }
const TRAINED = Array.from({ length: 32 }, (_, i) => ({ d: dayAgo(Math.floor((31 - i) * 50 / 31) + 1) }))

// Enough of a profile for lib/macros.js to work a real plan out of: 80 kg, 180 cm, 30.
const BODY = { bodyweight: [{ d: '2026-10-20', w: 80, t: 1 }], heightCm: 180, age: 30, body: 'male', unit: 'kg', workouts: TRAINED }

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  // Noon on 2026-10-21, so a fast started at 02:00 reads as 10h whatever the machine's zone is.
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN)
  waterSheet.mockClear(); fastingSheet.mockClear(); foodSheet.mockClear(); macroSheet.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

const mount = (S = {}) => {
  useStore.setState(s => ({ S: {
    ...s.S, water: [], food: [], fastLog: [], fasting: null,
    macroMode: null, macroGoal: {}, heightCm: null, age: null, bodyweight: [], workouts: [],
    ...S,
  } }))
  act(() => root.render(<WellnessCard />))
}
const byText = (sel, text) => [...host.querySelectorAll(sel)].find(el => el.textContent.trim() === text)
const buttons = () => [...host.querySelectorAll('button')]
const text = () => host.textContent

describe('the daily-essentials card', () => {
  it('shows today\'s water against the goal', () => {
    mount({ water: [{ d: '2026-10-21', ml: 1250, t: 1 }], waterGoal: 2000 })
    expect(text()).toContain('Water')
    expect(text()).toContain('1,250 / 2,000 ml')
  })

  it('falls back to the default goal on a profile that never set one', () => {
    mount({ waterGoal: undefined })
    expect(text()).toContain('2,000 ml')
  })

  it('adds a glass with one tap, on top of what is already logged', () => {
    mount({ water: [{ d: '2026-10-21', ml: 500, t: 1 }] })
    const chip = byText('button', '+250')
    act(() => chip.click())
    expect(useStore.getState().S.water).toEqual([{ d: '2026-10-21', ml: 750, t: expect.any(Number) }])
  })

  it('offers no edit button until there is water to edit', () => {
    mount()
    expect(byText('button', 'Edit')).toBeFalsy()
    mount({ water: [{ d: '2026-10-21', ml: 500, t: 1 }] })
    expect(byText('button', 'Edit')).toBeTruthy()
  })

  it('shows the day as a body that fills, with what is still to go', () => {
    mount({ water: [{ d: '2026-10-21', ml: 1250, t: 1 }], waterGoal: 2000 })
    expect(host.querySelector('.wl-body.sm')).toBeTruthy()
    expect(text()).toContain('63%')
    expect(text()).toContain('750 ml to go')
    expect(host.querySelector('.wl-bar')).toBeNull()      // one meter on this row, not two
  })

  it('lists what the water is doing on the card itself, not only in the sheet', () => {
    mount({ water: [{ d: '2026-10-21', ml: 1000, t: 1 }], waterGoal: 2000 })
    // The card is where the glass is logged, so it is where the reason to pour the next one is.
    expect(text()).toContain('Fewer headaches')
    expect(text()).toContain('Stronger in the session')
    expect(text()).not.toContain('Mild dehydration is a common trigger.')
  })

  it('brightens each benefit as the water reaches it', () => {
    const earned = ml => {
      mount({ water: [{ d: '2026-10-21', ml, t: 1 }], waterGoal: 2000 })
      return host.querySelectorAll('.wl-bench-row.on').length
    }
    expect(earned(250)).toBe(0)
    expect(earned(500)).toBe(1)
    expect(earned(1000)).toBe(2)
    expect(earned(2000)).toBe(4)
  })

  it('says when the day is running behind, and nothing when it is not', () => {
    mount({ water: [{ d: '2026-10-21', ml: 200, t: 1 }], waterGoal: 2000 })
    expect(text()).toContain('800 ml behind for the time of day')   // noon: half the day gone
    mount({ water: [{ d: '2026-10-21', ml: 1500, t: 1 }], waterGoal: 2000 })
    expect(text()).not.toContain('behind')
  })

  it('puts a glass back with one tap when it was logged by accident', () => {
    mount({ water: [{ d: '2026-10-21', ml: 500, t: 1 }] })
    act(() => byText('button', '+500').click())
    expect(useStore.getState().S.water[0].ml).toBe(1000)
    const { toastMsg, toastAction } = useUI.getState()
    expect(toastMsg).toBe('500 ml logged')
    expect(toastAction.label).toBe('Undo')
    act(() => toastAction.run())
    expect(useStore.getState().S.water[0].ml).toBe(500)
  })
})

describe('the fasting row', () => {
  it('starts the window last chosen, in one tap', () => {
    mount({ fastWindow: '18:6' })
    act(() => byText('button', 'Start fast').click())
    const S = useStore.getState().S
    expect(S.fasting).toMatchObject({ preset: '18:6', startedAt: expect.any(Number) })
  })

  it('offers the window as the way into the sheet', () => {
    mount({ fastWindow: '20:4' })
    expect(byText('button', '20:4')).toBeTruthy()
    act(() => byText('button', '20:4').click())
    expect(fastingSheet).toHaveBeenCalled()
  })

  it('counts up while a fast runs and says how much is left', () => {
    const startedAt = new Date(2026, 9, 21, 2, 0, 0).getTime()
    mount({ fasting: { preset: '16:8', startedAt } })
    expect(text()).toContain('10h 0m')
    expect(text()).toContain('6h 0m to go')
    expect(byText('button', 'End fast')).toBeTruthy()
    expect(byText('button', 'Start fast')).toBeFalsy()
  })

  it('says the goal is reached once the window is done, instead of a time to go', () => {
    const startedAt = new Date(2026, 9, 20, 18, 0, 0).getTime()   // 18h ago
    mount({ fasting: { preset: '16:8', startedAt } })
    // Scoped to the fasting row's own line: the water row above it has its own "to go", which says
    // nothing about whether the fasting window is done.
    const reached = [...host.querySelectorAll('.dim')].find(el => el.textContent.trim() === 'Goal reached')
    expect(reached).toBeTruthy()
    expect(reached.textContent).not.toContain('to go')
  })

  it('records the fast and stops the clock when ended', () => {
    const startedAt = new Date(2026, 9, 20, 18, 0, 0).getTime()   // 18h: over target
    mount({ fasting: { preset: '16:8', startedAt } })
    act(() => byText('button', 'End fast').click())
    const S = useStore.getState().S
    expect(S.fasting).toBeNull()
    expect(S.fastWindow).toBe('16:8')          // remembered for the next one
    expect(S.fastLog).toEqual([expect.objectContaining({ d: '2026-10-21', h: 18, hit: true })])
  })

  it('records a fast cut short as one that missed its target', () => {
    const startedAt = new Date(2026, 9, 21, 6, 0, 0).getTime()    // 6h
    mount({ fasting: { preset: '20:4', startedAt } })
    act(() => byText('button', 'End fast').click())
    expect(useStore.getState().S.fastLog[0]).toMatchObject({ h: 6, goal: 20, hit: false })
  })
})

describe('the calories row', () => {
  it('says nothing is logged on a day with no food', () => {
    mount()
    expect(text()).toContain('Nothing logged today')
  })

  it('shows the day\'s calories and its macros', () => {
    mount({
      food: [
        { id: 'a', d: '2026-10-21', at: 1, name: 'Oats', kcal: 400, p: 20, c: 55, f: 8 },
        { id: 'b', d: '2026-10-20', at: 2, name: 'Old', kcal: 999, p: 0, c: 0, f: 0 },
      ],
    })
    expect(text()).toContain('400 kcal')
    expect(text()).toContain('Protein 20')
    expect(text()).toContain('Carbs 55')
    expect(text()).toContain('Fat 8')
    expect(text()).not.toContain('999')
  })

  it('shows the goal beside the total once one is set', () => {
    mount({
      macroGoal: { kcal: 2400, p: null, c: null, f: null },
      food: [{ id: 'a', d: '2026-10-21', at: 1, name: 'Oats', kcal: 400, p: 20, c: 55, f: 8 }],
    })
    expect(text()).toContain('400')
    expect(text()).toContain('/ 2,400 kcal')
  })

  it('names the goal it is holding you to, and that is what opens the goal sheet', () => {
    mount({ ...BODY, macroMode: 'cut' })
    expect(byText('button', 'Lose weight')).toBeTruthy()
    act(() => byText('button', 'Lose weight').click())
    expect(macroSheet).toHaveBeenCalled()
  })

  it('shows the pace and the daily minimum the derived goal implies', () => {
    mount({ ...BODY, macroMode: 'bulk' })
    expect(text()).toContain('0.3 kg a week')
    expect(text()).toContain('2,270 kcal a day minimum')
  })

  it('asks for a goal, rather than a bare number, when there is nothing to plan from', () => {
    mount()
    expect(byText('button', 'Set your goal')).toBeTruthy()
    act(() => byText('button', 'Set your goal').click())
    expect(macroSheet).toHaveBeenCalled()
  })

  it('says what is missing when a goal is chosen but the plan cannot be worked out', () => {
    // A goal is chosen; the resting burn has no height or age to work from.
    mount({ ...BODY, heightCm: null, age: null, macroMode: 'bulk' })
    expect(byText('button', 'Add your height and age')).toBeTruthy()
    expect(byText('button', 'Set your goal')).toBeFalsy()
  })

  it('opens the food sheet', () => {
    mount()
    act(() => byText('button', 'Log food').click())
    expect(foodSheet).toHaveBeenCalled()
  })
})

describe('the whole card', () => {
  it('renders every row, in one card, with one button per action', () => {
    mount()
    expect(host.querySelectorAll('.card')).toHaveLength(1)
    const labels = [...host.querySelectorAll('.lbl2')].map(el => el.textContent)
    expect(labels).toEqual(['Water', 'Fasting', 'Calories'])
    expect(buttons().length).toBeGreaterThan(0)
  })
})

describe("the day's line", () => {
  it('shows exactly one line, under the water row, and it is one of ours', () => {
    mount()
    const quips = host.querySelectorAll('.wl-quip')
    expect(quips).toHaveLength(1)
    const said = quips[0].textContent
    expect(WATER_LINES).toContain(said)
    expect(said).toBe(waterLineFor())
  })

  it('does not rename a line or attach anybody to it', () => {
    mount()
    const said = host.querySelector('.wl-quip').textContent
    expect(said).not.toMatch(/[—""]/)
  })

  it('lives in the water block, below the figure and the quick-adds', () => {
    mount()
    const quip = host.querySelector('.wl-quip')
    const figure = host.querySelector('.wl-body')
    // The line and the pace behind it are one statement about the day, so they share a
    // .wl-status. That block sits inside the water block rather than being it.
    const status = quip.closest('.wl-status')
    expect(status).toBeTruthy()
    expect(status.querySelector('.wl-quip')).toBe(quip)
    // The pace belongs to the same block as the line, never stranded beside it.
    const pace = host.querySelector('.wl-pace')
    if (pace) expect(pace.closest('.wl-status')).toBe(status)
    // Same block as the body it belongs to, not floating somewhere else on the card.
    expect(status.parentElement.contains(figure)).toBe(true)
    // Document order: the figure is rendered before the line.
    expect(figure.compareDocumentPosition(quip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // And the line is not inside the figure's own bench, so it cannot be clipped by it.
    expect(quip.closest('.wl-bench')).toBeNull()
  })

  it('does not change when water is logged', () => {
    mount()
    const before = host.querySelector('.wl-quip').textContent
    act(() => { /* re-render with water on the day */ })
    expect(host.querySelector('.wl-quip').textContent).toBe(before)
  })
})
