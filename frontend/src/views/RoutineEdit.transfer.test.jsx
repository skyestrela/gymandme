// @vitest-environment happy-dom
// Move an exercise from one routine to another: the exercise's sheet in the routine editor
// offers the way out, the sheet that follows picks the routine it goes to, and the change
// carries an Undo that puts the exercise back where it was.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sheets = vi.hoisted(() => ({
  exConfigSheet: vi.fn(), exercisePicker: vi.fn(), glyphPicker: vi.fn(), confirmSheet: vi.fn(),
  moveExerciseSheet: vi.fn(), exerciseAnimationSheet: vi.fn(),
}))
vi.mock('../lib/api.js', () => ({ api: vi.fn(() => Promise.resolve({})) }))
vi.mock('../sheets.jsx', () => sheets)
vi.mock('../components/Media.jsx', () => ({ Thumb: () => null }))
vi.mock('../components/BodyMap.jsx', () => ({ default: () => null }))

import RoutineEdit from './RoutineEdit.jsx'
import { copyExerciseTo, moveExerciseTo } from '../lib/routine-actions.js'
import { DEF, useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = value => JSON.parse(JSON.stringify(value))
const BENCH = '0025', ROW = '0027'
const benchSlot = { id: BENCH, sets: 4, mode: 'reps', reps: 6, weight: 80, prog: 'double', repsMin: 4, note: 'touch and go', restSec: 180 }
const rowSlot = { id: ROW, sets: 3, mode: 'reps', reps: 10, weight: 50 }
let root, host

function mount() {
  const S = clone(DEF)
  S.routines = [
    { id: 'r1', name: 'Push', emoji: 'dumbbell', ex: [clone(benchSlot), clone(rowSlot)] },
    { id: 'r2', name: 'Pull', emoji: 'dumbbell', ex: [] },
  ]
  useStore.setState({ S, user: null })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(
    <MemoryRouter initialEntries={['/plan/r/r1']}>
      <Routes><Route path="/plan/r/:id" element={<RoutineEdit />} /></Routes>
    </MemoryRouter>,
  ))
}
const routines = () => useStore.getState().S.routines

beforeEach(() => {
  localStorage.clear()
  Object.values(sheets).forEach(m => m.mockReset())
  useUI.setState({ toastMsg: '', toastAction: null, sheets: [] })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('RoutineEdit — the exercise’s animation', () => {
  it('the button sits just after the chain button, and opens the movement', () => {
    mount()
    // the second exercise: the chain button (superset with the one above) is on it
    const row = host.querySelectorAll('[data-routine-row] .item')[1]
    const chain = row.querySelector('[title="Superset with exercise above"]')
    const anim = row.querySelector('[aria-label="Show the animation"]')
    expect(chain).toBeTruthy()
    expect(anim).toBeTruthy()
    expect(chain.nextElementSibling).toBe(anim)
  })

  it('the animation opens its own sheet, not the exercise’s', () => {
    mount()
    const anim = host.querySelector('[aria-label="Show the animation"]')
    act(() => anim.click())
    expect(sheets.exerciseAnimationSheet).toHaveBeenCalledOnce()
    expect(sheets.exerciseAnimationSheet.mock.calls[0][0].id).toBe(BENCH)
    // the row itself does not open the exercise's sheet
    expect(sheets.exConfigSheet).not.toHaveBeenCalled()
  })
})

describe('RoutineEdit — move an exercise to another routine', () => {
  it("the exercise's sheet offers the way out to another routine", () => {
    mount()
    act(() => host.querySelector('[data-routine-row] .item').click())
    const onMove = sheets.exConfigSheet.mock.calls[0][8]
    expect(onMove).toBeTypeOf('function')
    act(() => onMove())
    expect(sheets.moveExerciseSheet).toHaveBeenCalledOnce()
    const [ex, routineId, index] = sheets.moveExerciseSheet.mock.calls[0]
    expect(ex.id).toBe(BENCH)
    expect(routineId).toBe('r1')
    expect(index).toBe(0)
  })

  it('the exercise leaves the routine and keeps what was set up for it', () => {
    mount()
    expect(moveExerciseTo('r1', 0, 'r2')).toBe(true)
    expect(routines()[0].ex.map(e => e.id)).toEqual([ROW])
    expect(routines()[1].ex).toEqual([benchSlot])
  })

  it('the Undo puts the exercise back where it was', () => {
    mount()
    moveExerciseTo('r1', 0, 'r2')
    expect(useUI.getState().toastMsg).toContain('Pull')
    expect(useUI.getState().toastAction).toBeTruthy()
    act(() => useUI.getState().toastAction.run())
    expect(routines()[0].ex).toEqual([benchSlot, rowSlot])
    expect(routines()[1].ex).toEqual([])
  })

  it('a copy leaves the exercise where it is and puts another one in the other routine', () => {
    mount()
    expect(copyExerciseTo('r1', 0, 'r2')).toBe(true)
    expect(routines()[0].ex).toEqual([benchSlot, rowSlot])
    expect(routines()[1].ex).toEqual([benchSlot])
    act(() => useUI.getState().toastAction.run())
    expect(routines()[1].ex).toEqual([])
    expect(routines()[0].ex).toEqual([benchSlot, rowSlot])
  })

  it('does nothing when the exercise would move into the routine it is already in', () => {
    mount()
    expect(moveExerciseTo('r1', 0, 'r1')).toBe(false)
    expect(copyExerciseTo('r1', 0, 'r1')).toBe(false)
    expect(routines()[0].ex).toEqual([benchSlot, rowSlot])
  })

  it('a superset does not follow the exercise into the other routine', () => {
    const S = clone(DEF)
    S.routines = [
      { id: 'r1', name: 'Push', emoji: 'dumbbell', ex: [{ ...benchSlot, sg: 'g1' }, { ...rowSlot, sg: 'g1' }] },
      { id: 'r2', name: 'Pull', emoji: 'dumbbell', ex: [] },
    ]
    useStore.setState({ S, user: null })
    moveExerciseTo('r1', 0, 'r2')
    expect(routines()[0].ex[0].sg).toBeUndefined()
    expect(routines()[1].ex[0].sg).toBeUndefined()
  })
})
