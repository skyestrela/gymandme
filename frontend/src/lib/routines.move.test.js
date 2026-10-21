// Move an exercise from one routine to another, and copy it into one: the slot keeps what was
// set up for it, the routine it belongs to changes, and a superset never spans two routines.
import { describe, it, expect } from 'vitest'
import { moveExerciseToRoutine, copyExerciseToRoutine, restoreMovedExercise } from './routines.js'

const BENCH = '0025'   // barbell bench press
const ROW = '0322'     // barbell row
const OHP = '0029'     // overhead press
const CURL = '0387'    // dumbbell curl

const slot = (id, extra = {}) => ({ id, sets: 3, mode: 'reps', reps: 8, weight: 60, ...extra })
const state = (push, pull) => ({
  routines: [
    { id: 'push', name: 'Push', ex: push },
    { id: 'pull', name: 'Pull', ex: pull },
  ],
  week: {}, dayPlan: {}, workouts: [],
})

describe('moveExerciseToRoutine', () => {
  it('takes the exercise out of one routine and puts it at the end of the other', () => {
    const s = state([slot(BENCH, { note: 'pause on the chest', restSec: 150 }), slot(OHP)], [slot(ROW)])
    const res = moveExerciseToRoutine(s, 'push', 0, 'pull')
    expect(res.moved).toEqual(slot(BENCH, { note: 'pause on the chest', restSec: 150 }))
    expect(s.routines[0].ex.map(e => e.id)).toEqual([OHP])
    expect(s.routines[1].ex.map(e => e.id)).toEqual([ROW, BENCH])
  })

  it('keeps every part of the prescription with it', () => {
    const s = state([slot(BENCH, { prog: 'double', inc: 1.25, repsMin: 6, warmupSets: 2, note: 'bar only' })], [])
    const res = moveExerciseToRoutine(s, 'push', 0, 'pull')
    expect(res.moved).toEqual({
      id: BENCH, sets: 3, mode: 'reps', reps: 8, weight: 60, prog: 'double', inc: 1.25, repsMin: 6,
      warmupSets: 2, note: 'bar only',
    })
  })

  it('does not drag the routine\'s history with it', () => {
    // Progress belongs to a routine and an exercise together (#216): the new routine starts its
    // own line for the exercise, and the old one keeps the sessions it had.
    const s = state([slot(BENCH)], [])
    s.workouts = [{ id: 'w1', d: '2026-10-01', entries: [{ id: BENCH, rid: 'push' }] }]
    moveExerciseToRoutine(s, 'push', 0, 'pull')
    expect(s.workouts).toEqual([{ id: 'w1', d: '2026-10-01', entries: [{ id: BENCH, rid: 'push' }] }])
  })

  it('never lets a superset span two routines', () => {
    const s = state([slot(BENCH, { sg: 'sg-0-1' }), slot(OHP, { sg: 'sg-0-1' })], [])
    const res = moveExerciseToRoutine(s, 'push', 0, 'pull')
    expect(res.moved.sg).toBeUndefined()
    // The partner left behind loses its link too: a group of one is not a superset.
    expect(s.routines[0].ex[0].sg).toBeUndefined()
  })

  it('keeps the group whole when the exercise that leaves it had two partners', () => {
    // Three in a group; the middle one goes. The two left are still side by side, so they
    // stay a superset with each other.
    const s = state([slot(BENCH, { sg: 'g' }), slot(OHP, { sg: 'g' }), slot(CURL, { sg: 'g' })], [])
    moveExerciseToRoutine(s, 'push', 1, 'pull')
    expect(s.routines[0].ex.map(e => e.sg)).toEqual(['g', 'g'])
  })

  it('hands over a copy, not the slot itself', () => {
    const s = state([slot(BENCH)], [])
    const original = s.routines[0].ex[0]
    const res = moveExerciseToRoutine(s, 'push', 0, 'pull')
    expect(res.moved).not.toBe(original)
  })

  it('does nothing when the exercise is moved into the routine it is already in', () => {
    const s = state([slot(BENCH), slot(OHP)], [])
    expect(moveExerciseToRoutine(s, 'push', 0, 'push')).toBe(null)
    expect(s.routines[0].ex.map(e => e.id)).toEqual([BENCH, OHP])
  })

  it('does nothing when there is no such routine or no such exercise', () => {
    const s = state([slot(BENCH)], [])
    expect(moveExerciseToRoutine(s, 'push', 0, 'nope')).toBe(null)
    expect(moveExerciseToRoutine(s, 'nope', 0, 'pull')).toBe(null)
    expect(moveExerciseToRoutine(s, 'push', 5, 'pull')).toBe(null)
    expect(moveExerciseToRoutine(s, 'push', -1, 'pull')).toBe(null)
    expect(s.routines[0].ex.map(e => e.id)).toEqual([BENCH])
    expect(s.routines[1].ex).toEqual([])
  })
})

describe('copyExerciseToRoutine', () => {
  it('leaves the exercise where it was and adds a copy to the other routine', () => {
    const s = state([slot(BENCH, { note: 'pause' })], [slot(ROW)])
    const res = copyExerciseToRoutine(s, 'push', 0, 'pull')
    expect(res.moved).toEqual(slot(BENCH, { note: 'pause' }))
    expect(s.routines[0].ex.map(e => e.id)).toEqual([BENCH])
    expect(s.routines[1].ex.map(e => e.id)).toEqual([ROW, BENCH])
  })

  it('does not let the copy join a superset in the target by accident', () => {
    // The copy arrives without a group, so it cannot land next to a partner carrying the same
    // group id and join it.
    const s = state([slot(BENCH, { sg: 'sg-0-1' })], [slot(ROW, { sg: 'sg-0-1' }), slot(CURL, { sg: 'sg-0-1' })])
    const res = copyExerciseToRoutine(s, 'push', 0, 'pull')
    expect(res.moved.sg).toBeUndefined()
    expect(s.routines[1].ex.map(e => e.sg)).toEqual(['sg-0-1', 'sg-0-1', undefined])
  })
})

describe('restoreMovedExercise', () => {
  it('puts a moved exercise back, both routines whole', () => {
    const s = state([slot(BENCH), slot(OHP)], [slot(ROW)])
    const res = moveExerciseToRoutine(s, 'push', 0, 'pull')
    expect(restoreMovedExercise(s, res.snap)).toBe(true)
    expect(s.routines[0].ex.map(e => e.id)).toEqual([BENCH, OHP])
    expect(s.routines[1].ex.map(e => e.id)).toEqual([ROW])
  })

  it('puts a copied exercise back by taking the copy away, and leaves the source alone', () => {
    const s = state([slot(BENCH)], [slot(ROW)])
    const res = copyExerciseToRoutine(s, 'push', 0, 'pull')
    expect(restoreMovedExercise(s, res.snap)).toBe(true)
    expect(s.routines[0].ex.map(e => e.id)).toEqual([BENCH])
    expect(s.routines[1].ex.map(e => e.id)).toEqual([ROW])
  })

  it('puts the superset link back with the exercise', () => {
    const s = state([slot(BENCH, { sg: 'g' }), slot(OHP, { sg: 'g' })], [])
    const res = moveExerciseToRoutine(s, 'push', 0, 'pull')
    restoreMovedExercise(s, res.snap)
    expect(s.routines[0].ex.map(e => e.sg)).toEqual(['g', 'g'])
  })

  it('keeps a change another device made to the target, and still takes the moved exercise away', () => {
    const s = state([slot(BENCH)], [slot(ROW)])
    const res = moveExerciseToRoutine(s, 'push', 0, 'pull')
    // Another device adds an exercise to the target while the move is on its way.
    s.routines[1].ex.push(slot(CURL))
    expect(restoreMovedExercise(s, res.snap)).toBe(true)
    expect(s.routines[1].ex.map(e => e.id)).toEqual([ROW, CURL])
  })

  it('keeps a change another device made to the source, and still puts the exercise back', () => {
    const s = state([slot(BENCH), slot(OHP)], [])
    const res = moveExerciseToRoutine(s, 'push', 0, 'pull')
    s.routines[0].ex.push(slot(CURL))
    expect(restoreMovedExercise(s, res.snap)).toBe(true)
    // The exercise goes back to the place it held, and the other device's exercise stays.
    expect(s.routines[0].ex.map(e => e.id)).toEqual([BENCH, OHP, CURL])
  })

  it('does nothing when the source routine is gone', () => {
    const s = state([slot(BENCH)], [])
    const res = moveExerciseToRoutine(s, 'push', 0, 'pull')
    s.routines = s.routines.filter(r => r.id !== 'push')
    expect(restoreMovedExercise(s, res.snap)).toBe(false)
  })
})
