// @vitest-environment happy-dom
// The plan of a routine, edited from Plan: the exercises of a routine open right where the
// routines are listed, and an exercise can move to another routine from there.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
const sheets = vi.hoisted(() => ({
  dayAssignSheet: vi.fn(), starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), menuSheet: vi.fn(),
  planHasRoutines: () => true, exportPlanFile: vi.fn(), printWholePlan: vi.fn(), importPlanFile: vi.fn(),
  exercisePicker: vi.fn(), exConfigSheet: vi.fn(), moveExerciseSheet: vi.fn(),
}))
vi.mock('../sheets.jsx', () => sheets)

import Plan from './Plan.jsx'
import { moveExerciseTo } from '../lib/routine-actions.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
const clone = value => JSON.parse(JSON.stringify(value))
const BENCH = '0025', ROW = '0027'
const benchSlot = { id: BENCH, sets: 4, mode: 'reps', reps: 6, weight: 80 }
const rowSlot = { id: ROW, sets: 3, mode: 'reps', reps: 10, weight: 50 }
let host, root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.setItem('gym_plan_view', 'routines')
  nav.mockClear()
  // planHasRoutines is a plain function in the mock, not a spy.
  Object.values(sheets).forEach(m => { if (typeof m.mockReset === 'function') m.mockReset() })
  useUI.setState({ toastMsg: '', toastAction: null, sheets: [] })
  const S = clone(useStore.getState().S)
  S.routines = [
    { id: 'push', name: 'Push A', emoji: 'dumbbell', ex: [clone(benchSlot), clone(rowSlot)] },
    { id: 'pull', name: 'Pull A', emoji: 'dumbbell', ex: [] },
  ]
  S.week = {}
  S.dayPlan = {}
  useStore.setState(s => ({ S: { ...s.S, ...S }, user: null }))
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  localStorage.removeItem('gym_plan_view')
})

const mount = () => act(() => root.render(<Plan />))
const panel = () => host.querySelector('.plan-panel')
const byLabel = (label, scope = host) =>
  [...scope.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label)

// The routine's plan opens from a button on its row; the row's own tap still goes to the
// full editor.
const openPlan = () => {
  const btn = byLabel('Edit plan')
  expect(btn).toBeTruthy()
  act(() => btn.click())
}

describe('Plan — a routine\'s plan, edited where the routines are listed', () => {
  it('opens the exercises of the routine under its own row', () => {
    mount()
    expect(panel()).toBe(null)
    openPlan()
    expect(panel()).toBeTruthy()
    expect(host.querySelectorAll('.plan-ex')).toHaveLength(2)
  })

  it('the row still opens the full editor, and the plan button does not follow it', () => {
    mount()
    const row = host.querySelector('.plan-routine')
    act(() => row.click())
    expect(nav).toHaveBeenCalledWith('/plan/r/push')
    expect(panel()).toBe(null)
  })

  it('an exercise opens its settings sheet, with the way out to another routine', () => {
    mount()
    openPlan()
    act(() => host.querySelectorAll('.plan-ex .item-open')[0].click())
    expect(sheets.exConfigSheet).toHaveBeenCalledOnce()
    const [ex, existing, onSave, onDelete, routine] = sheets.exConfigSheet.mock.calls[0]
    expect(ex.id).toBe(BENCH)
    expect(existing.id).toBe(BENCH)
    expect(routine.id).toBe('push')
    expect(onDelete).toBeTypeOf('function')
    const onMove = sheets.exConfigSheet.mock.calls[0][8]
    expect(onMove).toBeTypeOf('function')
    act(() => onMove())
    expect(sheets.moveExerciseSheet).toHaveBeenCalledOnce()
    const [mex, routineId, index] = sheets.moveExerciseSheet.mock.calls[0]
    expect(mex.id).toBe(BENCH)
    expect(routineId).toBe('push')
    expect(index).toBe(0)
  })

  it('the row moves the exercise without opening its sheet first', () => {
    mount()
    openPlan()
    const btn = byLabel('Move to another routine', panel())
    expect(btn).toBeTruthy()
    act(() => btn.click())
    expect(sheets.moveExerciseSheet).toHaveBeenCalledOnce()
    expect(sheets.exConfigSheet).not.toHaveBeenCalled()
  })

  it('the exercise leaves this routine and lands in the other one', () => {
    mount()
    expect(moveExerciseTo('push', 0, 'pull')).toBe(true)
    const rs = useStore.getState().S.routines
    expect(rs[0].ex.map(e => e.id)).toEqual([ROW])
    expect(rs[1].ex.map(e => e.id)).toEqual([BENCH])
    // The Undo the toast offers puts it back.
    act(() => useUI.getState().toastAction.run())
    expect(useStore.getState().S.routines[0].ex.map(e => e.id)).toEqual([BENCH, ROW])
    expect(useStore.getState().S.routines[1].ex).toEqual([])
  })

  it('the exercise shows its animation in front of the name', () => {
    mount()
    openPlan()
    const rows = panel().querySelectorAll('.plan-ex')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      const anim = row.querySelector('.exmedia.tiny')
      expect(anim).toBeTruthy()
      expect(anim.querySelector('img')).toBeTruthy()
      // it sits in front of the name, not after it
      expect(row.firstElementChild).toBe(anim)
    }
  })

  it('the animation is its own thing: tapping it does not open the exercise’s sheet', () => {
    mount()
    openPlan()
    const anim = panel().querySelector('.plan-ex .exmedia.tiny')
    act(() => anim.click())
    expect(sheets.exConfigSheet).not.toHaveBeenCalled()
  })

  it('an exercise is added to the routine from the panel', () => {
    mount()
    openPlan()
    const add = [...panel().querySelectorAll('button')].find(b => b.textContent.trim() === 'Add exercise')
    expect(add).toBeTruthy()
    act(() => add.click())
    expect(sheets.exercisePicker).toHaveBeenCalledOnce()
    const [onPick] = sheets.exercisePicker.mock.calls[0]
    act(() => onPick({ id: '0029' }, true))
    expect(useStore.getState().S.routines[0].ex.map(e => e.id)).toEqual([BENCH, ROW, '0029'])
  })
})
