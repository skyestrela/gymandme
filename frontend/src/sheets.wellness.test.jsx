// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = { sheets: [], store: { S: {} }, toast: vi.fn() }
  // The store's update() hands the mutator the profile (S), not the whole store.
  state.snapshot = () => ({ ...state.store, update: fn => fn(state.store.S) })
  return state
})
vi.mock('./store/useStore.js', () => {
  const useStore = sel => (sel ? sel(mocks.snapshot()) : mocks.snapshot())
  useStore.getState = mocks.snapshot
  useStore.setState = patch => Object.assign(mocks.store, patch)
  return { useStore }
})
vi.mock('./store/useUI.js', () => {
  const snap = () => ({ toast: (...a) => mocks.toast(...a), openSheet: render => { mocks.sheets.push(render); return {} } })
  const useUI = sel => (sel ? sel(snap()) : snap())
  useUI.getState = snap
  return { useUI }
})

import { waterSheet, fastingSheet, foodSheet, macroSheet, essentialsCalendarSheet } from './sheets.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
// The clock every sheet in here sees. TODAY has to be built from THIS, not from the real one:
// the component calls todayISO() while the timer is frozen, so a TODAY read at module load would
// silently drift a day behind the day under test — which is exactly what happened.
const FROZEN = new Date(2026, 9, 21, 12, 0, 0)
// Local parts, to match todayISO(). toISOString() is UTC and disagrees either side of midnight.
const TODAY = `${FROZEN.getFullYear()}-${String(FROZEN.getMonth() + 1).padStart(2, '0')}-${String(FROZEN.getDate()).padStart(2, '0')}`

// Four sessions a week for the last eight weeks - 32 trained days, which is what the
// activity factor in lib/macros.js reads as "four times a week".
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
const TRAINED = Array.from({ length: 32 }, (_, i) => ({ d: dayAgo(Math.floor((31 - i) * 50 / 31) + 1) }))
// 80 kg, 180 cm, 30, cutting to 75 kg.
const PROFILE = {
  unit: 'kg', body: 'male', bodyweight: [{ d: '2026-10-20', w: 80, t: 1 }],
  heightCm: 180, age: 30, macroMode: 'cut', targetW: 75, workouts: TRAINED,
}


let host, root
beforeEach(() => {
  mocks.sheets.length = 0
  mocks.toast.mockClear()
  vi.useFakeTimers()
  vi.setSystemTime(FROZEN)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers() })

/** Call the sheet's exported opener, then render whatever it handed to openSheet. */
const open = fn => {
  fn()
  const render = mocks.sheets.at(-1)
  expect(render, 'the sheet did not open').toBeTypeOf('function')
  act(() => root.render(render(() => { mocks.closed = true })))
}
const state = () => mocks.store
const byText = (sel, text) => [...host.querySelectorAll(sel)].find(el => el.textContent.trim() === text)
const input = label => host.querySelector(`[aria-label="${label}"]`)
const type = async (el, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(el, String(value))
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const click = async el => { await act(async () => { el.click() }) }

beforeEach(() => { mocks.store.S = { water: [], food: [], fastLog: [], fasting: null } })

describe('the water sheet', () => {
  it('opens on today\'s total and the goal', () => {
    mocks.store.S.water = [{ d: TODAY, ml: 750, t: 1 }]
    mocks.store.S.waterGoal = 2500
    open(waterSheet)
    expect(host.textContent).toContain('Water')
    expect(input('Water (ml)').value).toBe('750')
    expect(input('Water goal (ml)').value).toBe('2500')
  })

  it('saves a changed total and goal', async () => {
    mocks.store.S.water = [{ d: TODAY, ml: 750, t: 1 }]
    open(waterSheet)
    await click(byText('button', '+250'))
    await click(byText('button', 'Save'))
    expect(state().S.water).toEqual([{ d: TODAY, ml: 1000, t: expect.any(Number) }])
    expect(mocks.toast).toHaveBeenCalledWith('Water saved')
  })

  it('clears the day without saving', async () => {
    mocks.store.S.water = [{ d: TODAY, ml: 750, t: 1 }]
    open(waterSheet)
    await click(byText('button', 'Clear'))
    expect(state().S.water).toEqual([])
  })

  it('draws the big body, with what the water is doing for you', () => {
    mocks.store.S.water = [{ d: TODAY, ml: 1000, t: 1 }]
    open(waterSheet)
    expect(host.querySelector('.wl-body.lg')).toBeTruthy()
    expect(host.textContent).toContain('Fewer headaches')
    expect(host.textContent).toContain('1,000 ml to go')
  })

  it('offers the goal this weight suggests, and writes nothing until it is tapped', async () => {
    Object.assign(mocks.store.S, { unit: 'kg', bodyweight: [{ d: TODAY, w: 78.7, t: 1 }] })
    open(waterSheet)
    expect(host.textContent).toContain('About 2,600 ml a day for your weight')
    expect(state().S.waterGoal).toBeUndefined()          // suggested, not applied
    await click(byText('button', 'Use this'))
    expect(state().S.waterGoal).toBe(2600)
  })

  it('says nothing about a weight on a profile that has never weighed in', () => {
    open(waterSheet)
    expect(host.textContent).not.toContain('for your weight')
    expect(host.textContent).toContain('comes from food')
  })

  it('offers nothing once the goal on file is already the one it would suggest', () => {
    Object.assign(mocks.store.S, { unit: 'kg', bodyweight: [{ d: TODAY, w: 78.7, t: 1 }], waterGoal: 2600 })
    open(waterSheet)
    expect(host.textContent).not.toContain('Use this')
  })

  it('adds the training allowance when there is a session on that day', () => {
    const dow = new Date(TODAY + 'T12:00:00').getDay()
    Object.assign(mocks.store.S, {
      unit: 'kg', bodyweight: [{ d: TODAY, w: 78.7, t: 1 }],
      routines: [{ id: 'r1', name: 'Push', ex: [] }], week: { [dow]: 'r1' }, dayPlan: {}, queue: null,
    })
    open(waterSheet)
    expect(host.textContent).toContain('About 3,100 ml a day for your weight')
    expect(host.textContent).toContain('training day')
  })
})

describe('the fasting sheet', () => {
  it('offers the windows and starts the one picked', async () => {
    open(fastingSheet)
    expect(byText('button', '16:8')).toBeTruthy()
    expect(byText('button', '18:6')).toBeTruthy()
    expect(byText('button', '20:4')).toBeTruthy()
    expect(byText('button', 'omad')).toBeTruthy()
    await click(byText('button', '18:6'))
    expect(state().S.fastWindow).toBe('18:6')
    await click(byText('button', 'Start fast'))
    expect(state().S.fasting).toMatchObject({ preset: '18:6' })
  })

  it('shows a running fast with what is left, and records it when ended', async () => {
    mocks.store.S.fasting = { preset: '16:8', startedAt: new Date(2026, 9, 21, 2, 0, 0).getTime() }
    open(fastingSheet)
    expect(host.textContent).toContain('10h 0m')
    expect(host.textContent).toContain('6h 0m to go')
    await click(byText('button', 'End fast'))
    expect(state().S.fasting).toBeNull()
    expect(state().S.fastLog).toEqual([expect.objectContaining({ h: 10, goal: 16, hit: false })])
  })

  it('lists what was fasted, and can drop one', async () => {
    mocks.store.S.fastLog = [{ id: 'f1', d: '2026-10-20', h: 17, goal: 16, preset: '16:8', hit: true, _ts: 1 }]
    open(fastingSheet)
    expect(host.textContent).toContain('17 h fasted')
    const del = host.querySelector('[aria-label="Delete"]')
    await click(del)
    expect(state().S.fastLog).toEqual([])
  })
})

describe('the food sheet', () => {
  it('logs a food with its calories and macros', async () => {
    open(foodSheet)
    await type(input('Food name'), 'Oats')
    await type(input('Calories'), '400')
    await type(input('Protein'), '20')
    await type(input('Carbs'), '55')
    await type(input('Fat'), '8')
    await click(byText('button', 'Save'))
    expect(state().S.food).toEqual([expect.objectContaining({
      name: 'Oats', kcal: 400, p: 20, c: 55, f: 8, d: TODAY,
    })])
    expect(mocks.toast).toHaveBeenCalledWith('Food logged')
  })

  it('refuses an entry with no name rather than logging a blank one', async () => {
    open(foodSheet)
    await click(byText('button', 'Save'))
    expect(state().S.food).toEqual([])
    expect(mocks.toast).toHaveBeenCalledWith('Give it a name')
  })

  it('offers a food logged before as a one-tap entry, with its macros', async () => {
    mocks.store.S.food = [{ id: 'o1', d: '2026-10-19', at: 1, name: 'Oats', kcal: 400, p: 20, c: 55, f: 8, _ts: 1 }]
    open(foodSheet)
    expect(host.textContent).toContain('Logged before')
    const chip = [...host.querySelectorAll('.chip')].find(el => el.textContent.includes('Oats'))
    await click(chip)
    expect(state().S.food).toHaveLength(2)
    expect(state().S.food[1]).toMatchObject({ name: 'Oats', kcal: 400, p: 20 })
  })

  it('edits an entry already logged today, keeping its id', async () => {
    mocks.store.S.food = [{ id: 'o1', d: TODAY, at: 1, name: 'Oats', kcal: 400, p: 20, c: 55, f: 8, _ts: 1 }]
    open(foodSheet)
    await click(host.querySelector('.ttl'))            // tap the entry to load it
    await type(input('Calories'), '520')
    await click(byText('button', 'Save'))
    expect(state().S.food).toHaveLength(1)
    expect(state().S.food[0]).toMatchObject({ id: 'o1', kcal: 520 })
  })

  it('deletes an entry from the day', async () => {
    mocks.store.S.food = [{ id: 'o1', d: TODAY, at: 1, name: 'Oats', kcal: 400, p: 0, c: 0, f: 0, _ts: 1 }]
    open(foodSheet)
    await click(host.querySelector('[aria-label="Delete"]'))
    expect(state().S.food).toEqual([])
  })

  it('shows the targets the chosen goal works out, not a number to type', () => {
    Object.assign(mocks.store.S, PROFILE)
    open(foodSheet)
    expect(host.textContent).toContain('2,420 kcal')
    expect(host.textContent).toContain('Lose weight')
    expect(host.querySelector('[aria-label="Calories goal"]')).toBeNull()
  })

  it('says what is needed when there is no plan to show yet', () => {
    open(foodSheet)
    expect(host.textContent).toContain('We can work these out for you')
  })

  it('sends you to the goal sheet to change any of it', async () => {
    Object.assign(mocks.store.S, PROFILE)
    open(foodSheet)
    await click(byText('button', 'Change'))
    expect(mocks.closed).toBe(true)
    expect(mocks.sheets).toHaveLength(2)
  })
})

describe('the goal sheet', () => {
  it('says what it is missing rather than inventing a plan', () => {
    open(macroSheet)
    expect(host.textContent).toContain('We need a weigh-in before we can work this out.')
  })

  it('takes the height and age the resting burn needs, then plans', async () => {
    mocks.store.S = { ...mocks.store.S, unit: 'kg', body: 'male', bodyweight: [{ d: '2026-10-20', w: 80, t: 1 }] }
    open(macroSheet)
    expect(host.textContent).toContain('Add your height and age below and the numbers appear here.')
    await type(input('Height (cm)'), '180')
    await type(input('Age'), '30')
    await click(byText('button', 'Save'))
    expect(state().S).toMatchObject({ heightCm: 180, age: 30 })
  })

  it('works the plan out and shows the floor it rests on', () => {
    Object.assign(mocks.store.S, PROFILE)
    open(macroSheet)
    const txt = host.textContent
    expect(txt).toContain('1,780 kcal')            // resting burn
    expect(txt).toContain('4x a week')             // what the training log says
    expect(txt).toContain('3,026 kcal')            // what that makes a day burn
    expect(txt).toContain('2,420')                 // a fifth off it
    expect(txt).toContain('160 g')                 // 2.0 g/kg of protein
    expect(txt).toContain('The minimum you require')
    expect(txt).toContain('2,270')                 // the calorie floor: never a quarter under
  })

  it('reworks the numbers when the goal changes', async () => {
    Object.assign(mocks.store.S, PROFILE)
    open(macroSheet)
    expect(host.textContent).toContain('2,420')
    await click(byText('button', 'Gain muscle'))
    expect(state().S.macroMode).toBe('bulk')
    open(macroSheet)                               // reopened, so the plan is rebuilt
    expect(host.textContent).toContain('3,330')
  })

  it('holds steady as the default rather than cutting somebody who has not chosen', () => {
    Object.assign(mocks.store.S, PROFILE, { macroMode: null })
    open(macroSheet)
    expect(host.textContent).toContain('3,030')
  })

  it('raises a hand-typed target that goes under the minimum, and says so', async () => {
    Object.assign(mocks.store.S, PROFILE)
    open(macroSheet)
    await click(host.querySelector('[role="switch"]'))
    await type(input('Calories goal'), '1200')
    await click(byText('button', 'Save'))
    expect(state().S.macroGoal).toMatchObject({ kcal: 2270 })
    expect(mocks.toast).toHaveBeenCalledWith('Raised to the minimum your body needs')
  })

  it('keeps a hand-typed target that clears the floor, exactly as typed', async () => {
    Object.assign(mocks.store.S, PROFILE)
    open(macroSheet)
    await click(host.querySelector('[role="switch"]'))
    await type(input('Calories goal'), '2600')
    await click(byText('button', 'Save'))
    expect(state().S.macroGoal).toMatchObject({ kcal: 2600 })
    expect(mocks.toast).toHaveBeenCalledWith('Saved')
  })

  it('goes back to the plan itself on request', async () => {
    Object.assign(mocks.store.S, PROFILE, { macroGoal: { kcal: 2600 } })
    open(macroSheet)
    await click(byText('button', 'Back to the plan'))
    expect(state().S.macroGoal).toEqual({})
  })
})

describe('the diet picker', () => {
  it('offers the three diets and starts on eating anything', () => {
    Object.assign(mocks.store.S, PROFILE)
    open(macroSheet)
    for (const label of ['Eating anything', 'Plant-based', 'Vegan']) {
      expect(byText('button', label), label).toBeTruthy()
    }
    expect(byText('button', 'Eating anything').getAttribute('aria-pressed')).toBe('true')
    expect(host.textContent).toContain('No change.')
    expect(host.textContent).toContain('160 g')            // 2.0 g/kg of 80 kg, unscaled
  })

  it('raises the protein floor on a plant diet and leaves the calories where they were', async () => {
    Object.assign(mocks.store.S, PROFILE)
    open(macroSheet)
    expect(host.textContent).toContain('2,420')
    await click(byText('button', 'Plant-based'))
    expect(state().S.diet).toBe('plant')
    open(macroSheet)                                      // reopened, so the plan is rebuilt
    const txt = host.textContent
    expect(txt).toContain('190 g')                        // 2.0 g/kg scaled by the plant factor
    expect(txt).toContain('2,420')                        // the calorie target has NOT moved
    expect(txt).toContain('Plant protein digests less completely')
  })

  it('gives fully vegan the nutrient note, and plant-based not', async () => {
    Object.assign(mocks.store.S, PROFILE)
    open(macroSheet)
    await click(byText('button', 'Plant-based'))
    open(macroSheet)
    expect(host.textContent).not.toContain('B12')
    await click(byText('button', 'Vegan'))
    expect(state().S.diet).toBe('vegan')
    open(macroSheet)
    expect(host.textContent).toContain('B12')
  })

  it('lifts a hand-typed protein number that the raised floor would otherwise refuse', async () => {
    Object.assign(mocks.store.S, PROFILE, { macroGoal: { p: 170, kcal: 2420, c: 335, f: 50 } })
    open(macroSheet)
    await click(byText('button', 'Vegan'))
    // 170 cleared the old 160 floor and does not clear the raised 192, so it has to come back
    // up. Leaving it would put the stored override below the minimum printed two lines below it.
    expect(state().S.macroGoal.p).toBe(190)
  })

  it('leaves a hand-typed number alone when it already clears the raised floor', async () => {
    Object.assign(mocks.store.S, PROFILE, { macroGoal: { p: 210, kcal: 2420, c: 300, f: 50 } })
    open(macroSheet)
    await click(byText('button', 'Vegan'))
    expect(state().S.macroGoal.p).toBe(210)
  })
})

describe('the essentials calendar sheet', () => {
  // Local parts, so the month lands where the grid arithmetic expects it regardless of zone.
  const OCT = new Date(2026, 9, 1)
  const cells = () => [...host.querySelectorAll('.cal-d')]
  const barsOf = cell => [...cell.querySelectorAll('.cal-eb i')].map(i => i.style.width)

  it('draws every day of the month, with three bars each', () => {
    Object.assign(mocks.store.S, PROFILE)
    open(() => essentialsCalendarSheet(OCT))
    expect(cells()).toHaveLength(31)                       // October
    expect(host.querySelectorAll('.cal-h')).toHaveLength(7)
    for (const cell of cells()) {
      expect(cell.querySelectorAll('.cal-eb')).toHaveLength(3)
    }
  })

  it('leaves an unlogged day with three empty bars rather than three full ones', () => {
    Object.assign(mocks.store.S, PROFILE)
    open(() => essentialsCalendarSheet(OCT))
    // Nothing is logged in October, so every bar is an empty track.
    for (const widths of cells().map(barsOf)) {
      expect(widths).toEqual(['0%', '0%', '0%'])
    }
    expect(host.textContent).toContain('Nothing logged yet this month')
  })

  it('fills only the bars that have something behind them', () => {
    Object.assign(mocks.store.S, PROFILE, {
      water: [{ d: '2026-10-06', ml: 1000, t: 1 }],        // half of the 2,000 ml goal
      food: [], fastLog: [],
    })
    open(() => essentialsCalendarSheet(OCT))
    // The 6th cell is the 6th: one cell per day, in order.
    expect(barsOf(cells()[5])).toEqual(['50%', '0%', '0%'])
    expect(barsOf(cells()[4])).toEqual(['0%', '0%', '0%'])
    expect(host.textContent).toContain('1 day logged')
  })

  it('gives a fast its own bar, scored against the hours it asked for', () => {
    Object.assign(mocks.store.S, PROFILE, {
      water: [], food: [],
      fastLog: [{ id: 'f1', d: '2026-10-09', h: 8, goal: 16, preset: '16:8', hit: false }],
    })
    open(() => essentialsCalendarSheet(OCT))
    expect(barsOf(cells()[8])).toEqual(['0%', '0%', '50%'])
  })

  it('opens the day it was tapped, with that day\u2019s numbers', async () => {
    Object.assign(mocks.store.S, PROFILE, {
      water: [{ d: '2026-10-06', ml: 1000, t: 1 }], food: [], fastLog: [],
    })
    open(() => essentialsCalendarSheet(OCT))
    await click(cells()[5])
    // Tapping the day closes the month and opens the day.
    expect(mocks.closed).toBe(true)
    const render = mocks.sheets.at(-1)
    act(() => root.render(render(() => {})))
    expect(host.textContent).toContain('1,000 / 2,000 ml')
  })

  it('says plainly when a day has nothing on it', async () => {
    Object.assign(mocks.store.S, PROFILE)
    open(() => essentialsCalendarSheet(OCT))
    await click(cells()[5])
    const render = mocks.sheets.at(-1)
    act(() => root.render(render(() => {})))
    expect(host.textContent).toContain('Nothing logged this day')
  })
})
