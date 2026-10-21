// Actions on a routine's exercises that any screen can take: take one out of a routine, move
// it to another one, or copy it into one. Each one writes through the store the way an edit
// does, so it syncs like an edit, and each carries an Undo that puts the change back exactly
// (lib/routines.js). The rules themselves — what a move keeps and what it drops — are pure and
// live there; this is the part that talks to the store.
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from './i18n-core.js'
import { exerciseNameText } from './format.js'
import { exOr } from './exercises.js'
import { cleanupSg } from './history.js'
import { markEntryUndone } from './sync-merge.js'
import { copyExerciseToRoutine, moveExerciseToRoutine, restoreMovedExercise } from './routines.js'

/**
 * Takes exercise `i` out of routine `routineId` with an Undo (v1.3.11: the row's swipe and the
 * exercise sheet's Remove). While the routine's exercises are still what the removal left, Undo
 * puts the list back as it was, superset links included (a partner left alone loses its link,
 * cleanupSg). Once something else changed them, the exercise goes back in at its old place.
 */
export function removeRoutineExercise(routineId, i) {
  const st = useStore.getState()
  const routine = st.S.routines.find(x => x.id === routineId)
  const slot = routine?.ex?.[i]
  if (!slot) return false
  const before = structuredClone(routine.ex)
  const base = Number(routine._f?.ex) || 0
  st.update(s => {
    const ex = s.routines.find(x => x.id === routineId)?.ex
    if (!ex) return
    ex.splice(i, 1); cleanupSg(ex)
  })
  const now = useStore.getState().S.routines.find(x => x.id === routineId)
  const after = JSON.stringify(now?.ex)
  const del = Number(now?._f?.ex) || 0
  useUI.getState().toast(t('“{0}” left the routine.', exerciseNameText(exOr(slot.id))),
    { action: t('Undo'), onAction: () => undoRemoveRoutineExercise({ routineId, i, before, after, base, del }) })
  return true
}
export function undoRemoveRoutineExercise({ routineId, i, before, after, base, del }) {
  if (!useStore.getState().S.routines.some(x => x.id === routineId)) {
    useUI.getState().toast(t('Too late, that one’s gone'))
    return false
  }
  useStore.getState().update(s => {
    const routine = s.routines.find(x => x.id === routineId)
    // Put back exactly, so a change another device made to these exercises before it saw the
    // removal still wins (lib/sync-merge.js, "Undo").
    if (JSON.stringify(routine.ex) === after) { routine.ex = structuredClone(before); if (del) markEntryUndone(routine, 'ex', base, del); return }
    routine.ex.splice(Math.min(i, routine.ex.length), 0, structuredClone(before[i]))
    cleanupSg(routine.ex)
  })
  return true
}

// The two stamps the Undo needs: the field's own time before the change, and after it. A change
// another device made to the same exercises in between then wins over the Undo, as it should
// (lib/sync-merge.js, "Undo").
const stampOf = (S, id) => Number(S?.routines?.find(r => r.id === id)?._f?.ex) || 0

/**
 * Move an exercise from one routine to another, with an Undo: the toast puts it back exactly,
 * its place in the source and its place in the target included (lib/routines.js).
 *
 * The exercise keeps its sets, reps, weight, rest, note and rule; it loses its superset link,
 * because a superset never spans two routines. Its history stays where it was: progress
 * belongs to a routine and an exercise together (#216), so the new routine starts its own line
 * for it.
 */
export function moveExerciseTo(routineId, index, targetId) {
  const st = useStore.getState()
  const from = st.S.routines.find(r => r.id === routineId)
  const to = st.S.routines.find(r => r.id === targetId)
  if (!from || !to || from.id === to.id) return false
  const slot = from.ex?.[index]
  if (!slot) return false
  const exId = slot.id
  const name = to.name
  const before = st.S
  let snap = null
  st.update(s => {
    const res = moveExerciseToRoutine(s, routineId, index, targetId)
    if (res) snap = res.snap
  })
  if (!snap) return false
  const after = useStore.getState().S
  snap.baseFrom = stampOf(before, routineId); snap.delFrom = stampOf(after, routineId)
  snap.baseTo = stampOf(before, targetId); snap.delTo = stampOf(after, targetId)
  useUI.getState().toast(t('“{0}” moved to {1}.', exerciseNameText(exOr(exId)), name),
    { action: t('Undo'), onAction: () => undoMovedExercise(snap) })
  return true
}

/**
 * The same exercise in another routine as well: it stays where it was and a copy of the slot
 * goes to the other routine. The copy is unlinked for the same reason a moved one is — a
 * superset never spans two routines.
 */
export function copyExerciseTo(routineId, index, targetId) {
  const st = useStore.getState()
  const from = st.S.routines.find(r => r.id === routineId)
  const to = st.S.routines.find(r => r.id === targetId)
  if (!from || !to || from.id === to.id) return false
  const slot = from.ex?.[index]
  if (!slot) return false
  const exId = slot.id
  const name = to.name
  const before = st.S
  let snap = null
  st.update(s => {
    const res = copyExerciseToRoutine(s, routineId, index, targetId)
    if (res) snap = res.snap
  })
  if (!snap) return false
  const after = useStore.getState().S
  snap.baseTo = stampOf(before, targetId); snap.delTo = stampOf(after, targetId)
  useUI.getState().toast(t('“{0}” copied to {1}.', exerciseNameText(exOr(exId)), name),
    { action: t('Undo'), onAction: () => undoMovedExercise(snap) })
  return true
}

/**
 * Undo for a move or a copy: the exercise goes back to the routine it came from, at the place
 * it held there, and the copy that was put in the other routine goes away. While both routines
 * are still what the change left them, they are put back whole; once something else changed one
 * of them, only the exercise goes back, so that other change is not thrown away with it.
 */
export function undoMovedExercise(snap) {
  let ok = false
  useStore.getState().update(s => {
    ok = restoreMovedExercise(s, snap)
    if (!ok) return
    const from = s.routines.find(r => r.id === snap.fromId)
    const to = s.routines.find(r => r.id === snap.toId)
    if (from) markEntryUndone(from, 'ex', snap.baseFrom, snap.delFrom)
    if (to) markEntryUndone(to, 'ex', snap.baseTo, snap.delTo)
  })
  if (!ok) useUI.getState().toast(t('Too late, that one’s gone'))
  return ok
}
