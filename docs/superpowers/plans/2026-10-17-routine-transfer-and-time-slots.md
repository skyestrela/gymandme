# Gym&Me Routine Transfer and Time-Slot Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Gym&Me schedule independent Morning, Afternoon and Night routine sessions on the same weekday and move an individual configured exercise to another routine safely.

**Architecture:** Introduce one schedule-shape module that accepts legacy weekday strings/arrays and canonical slot objects. Migrate all schedule readers and writers through that module, then expose a session-level API so Home/Start can select one slot rather than flattening every routine into a combined workout. Add a pure transfer helper with conflict-aware Undo, then expose it from the routine editor.

**Tech Stack:** React 19, Zustand 5, Vite 8, Vitest 4/happy-dom, Node API, Capacitor.

**Spec:** `docs/superpowers/specs/2026-10-17-routine-transfer-and-time-slots-design.md`

## Global Constraints

- Slots are exactly `morning`, `afternoon`, `night`, in that presentation order.
- Existing `S.week[day]` scalar and array schedules normalize into Morning without losing order.
- Multiple routines in one slot are a combined session; separate slots are separate sessions.
- Keep the existing single daily reminder; do not add slot-specific notifications.
- A move transfers one exercise occurrence, clones complete configuration, clears its old superset link, cleans the source grouping, and offers safe Undo.
- Historic workout records are immutable.
- Preserve browser/mobile persistence, server sync, API compatibility, plan sharing/printing, Coach and rotation behaviour.
- Do not overwrite, stage, commit, or otherwise alter unrelated pre-existing worktree changes.

---

## File structure

| File | Responsibility |
|---|---|
| `frontend/src/lib/schedule-slots.js` | Tolerant schedule normalization plus canonical read/write helpers for weekday slot data. |
| `frontend/src/lib/schedule-slots.test.js` | Legacy migration and slot helper contracts. |
| `frontend/src/lib/history.js` | Convert canonical slots into independently selectable effective sessions while retaining legacy flattened helpers for non-start consumers. |
| `frontend/src/lib/history.test.js` | Session-selection, override, queue, and legacy schedule regression coverage. |
| `frontend/src/lib/routines.js` | Delete/snapshot/restore pointers throughout nested slot schedules and pure exercise-transfer/undo helpers. |
| `frontend/src/lib/routines.test.js` | Pointer cleanup and transfer/undo behavior tests. |
| `frontend/src/views/Plan.jsx` / `frontend/src/sheets.jsx` | Display and edit the three weekday slots. |
| `frontend/src/views/Home.jsx`, `frontend/src/components/TabBar.jsx`, `frontend/src/views/Workout.jsx`, `frontend/src/sheets.jsx` | Select a scheduled slot before starting where more than one session is available. |
| `frontend/src/views/RoutineEdit.jsx` | Surface Move to routine with target selection and Undo. |
| `frontend/src/lib/plan-share.js` | Share/import/print canonical slot data and read legacy plan files. |
| `frontend/src/lib/sync-merge.js`, `api/sync-stamps.js` | Preserve/stamp canonical nested schedule state across concurrent changes. |
| `api/queue.js` | Choose the first valid Morning/Afternoon/Night routine for the existing one-per-day reminder fallback. |
| Locale files and focused existing tests | Translatable copy and UI/integration coverage. |

## Task 1: Establish schedule-shape helpers and migration contract

**Files:**
- Create: `frontend/src/lib/schedule-slots.js`
- Test: `frontend/src/lib/schedule-slots.test.js`
- Modify: `frontend/src/store/useStore.js` (state load normalization only)

**Interfaces:**
- Produces `SCHEDULE_SLOTS = ['morning', 'afternoon', 'night']`.
- Produces `slotIdsOf(value, slot) -> string[]`, `daySlotsOf(week, weekday) -> { morning: string[], afternoon: string[], night: string[] }`, `weekdayIdsOf(week, weekday) -> string[]`, `hasWeekdayPlan(week, weekday) -> boolean`, and `writeSlotIds(week, weekday, slot, ids) -> void`.
- `daySlotsOf` must tolerate old scalar/array values and place them in Morning; slot objects tolerate scalar/array slot values but emit cloned arrays.
- `writeSlotIds` must remove empty slot keys and remove the weekday key when every slot is empty.

- [ ] **Step 1: Write helper tests before production code**

```js
import { describe, expect, it } from 'vitest'
import { daySlotsOf, weekdayIdsOf, writeSlotIds } from './schedule-slots.js'

it('lifts a legacy combined weekday into Morning without changing order', () => {
  expect(daySlotsOf({ 1: ['push', 'core'] }, 1)).toEqual({
    morning: ['push', 'core'], afternoon: [], night: []
  })
  expect(weekdayIdsOf({ 1: 'push' }, 1)).toEqual(['push'])
})

it('writes only non-empty slots and removes an empty weekday', () => {
  const week = { 1: { morning: ['push'], night: ['mobility'] } }
  writeSlotIds(week, 1, 'morning', [])
  expect(week).toEqual({ 1: { night: ['mobility'] } })
  writeSlotIds(week, 1, 'night', [])
  expect(week).toEqual({})
})
```

- [ ] **Step 2: Run the new helper test to verify the missing module fails**

Run: `npm test -- --run src/lib/schedule-slots.test.js`

Expected: FAIL because `schedule-slots.js` does not exist.

- [ ] **Step 3: Implement the minimal, pure schedule helper module**

```js
export const SCHEDULE_SLOTS = ['morning', 'afternoon', 'night']
const ids = value => [].concat(value ?? []).filter(id => typeof id === 'string' && id)

export function daySlotsOf(week, weekday) {
  const raw = week?.[weekday]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { morning: ids(raw), afternoon: [], night: [] }
  }
  return Object.fromEntries(SCHEDULE_SLOTS.map(slot => [slot, ids(raw[slot])]))
}

export const weekdayIdsOf = (week, weekday) => SCHEDULE_SLOTS.flatMap(slot => daySlotsOf(week, weekday)[slot])

export function writeSlotIds(week, weekday, slot, values) {
  const next = daySlotsOf(week, weekday)
  next[slot] = ids(values)
  const compact = Object.fromEntries(SCHEDULE_SLOTS.filter(key => next[key].length).map(key => [key, next[key]]))
  if (Object.keys(compact).length) week[weekday] = compact
  else delete week[weekday]
}
```

Add a `normalizeWeekSlots(week)` helper used at store/system boundaries. It must preserve only valid weekday keys (0–6), use `writeSlotIds`, and return a new sparse canonical object.

- [ ] **Step 4: Normalize restored/local state at the store boundary**

In `loadState` / state construction in `frontend/src/store/useStore.js`, normalize `saved.week` after applying defaults and before it can be persisted or merged. Do not mutate a parsed raw object before its recovery path has validated it. Old saved arrays and strings must become canonical slot objects on the next normal persisted update.

- [ ] **Step 5: Run helper and store loading tests**

Run: `npm test -- --run src/lib/schedule-slots.test.js src/store/useStore.legacy-upgrade.test.jsx`

Expected: PASS, including existing legacy-state behavior.

## Task 2: Represent planned sessions without flattening slots

**Files:**
- Modify: `frontend/src/lib/history.js:411-471`
- Test: `frontend/src/lib/history.test.js`
- Modify: `frontend/src/lib/queue.js:168-203`
- Test: `frontend/src/lib/queue.test.js`

**Interfaces:**
- Produces `effectiveRoutineSessions(S, iso, today = todayISO()) -> Array<{ slot: 'morning'|'afternoon'|'night'|'override'|'queue', ids: string[] }>`.
- Retains `effectiveRoutineIds` as `effectiveRoutineSessions(...).flatMap(session => session.ids)` for calendar/read-only callers.
- Produces `effectiveRoutineSession(S, iso, today)` as the first session or `null`.
- A valid `dayPlan[iso]` override or queue/pin remains one standalone session and takes precedence exactly as it does today.
- Fixed-week slots containing queue ids must exclude those ids while the queue is live; an empty remainder slot is omitted.
- `weekTally` counts populated independent slots, not weekdays, for fixed-week planned totals.

- [ ] **Step 1: Add failing history tests for separate versus combined sessions**

```js
it('keeps routines together inside one slot but separates weekday time slots', () => {
  const S = state({ week: { 3: { morning: ['r1', 'r2'], night: ['r3'] } } })
  expect(effectiveRoutineSessions(S, ISO, ISO)).toEqual([
    { slot: 'morning', ids: ['r1', 'r2'] },
    { slot: 'night', ids: ['r3'] }
  ])
  expect(effectiveRoutineIds(S, ISO, ISO)).toEqual(['r1', 'r2', 'r3'])
})

it('continues to read a legacy weekday array as one Morning session', () => {
  expect(effectiveRoutineSessions(state({ week: { 3: ['r1', 'r2'] } }), ISO, ISO))
    .toEqual([{ slot: 'morning', ids: ['r1', 'r2'] }])
})
```

Add override and live-queue variants confirming their current precedence is unchanged and a fixed slot that contains only a live queue routine is omitted.

- [ ] **Step 2: Run only the new history cases to establish failure**

Run: `npm test -- --run src/lib/history.test.js`

Expected: FAIL because `effectiveRoutineSessions` is absent.

- [ ] **Step 3: Implement effective session selection**

Use `daySlotsOf` in `history.js`. Build the fixed-week component as ordered non-empty slot records after filtering deleted routines. Keep queue/override behavior in the existing order, but make it return records:

```js
export function effectiveRoutineSessions(S, iso, today = todayISO()) {
  const override = S.dayPlan?.[iso]
  if (override === 'rest') return []
  if (override && !pinState(S, override) && routineExists(S, override)) return [{ slot: 'override', ids: [override] }]
  const weekday = SCHEDULE_SLOTS.map(slot => ({
    slot,
    ids: daySlotsOf(S.week, new Date(iso + 'T12:00:00').getDay())[slot]
      .filter(id => routineExists(S, id))
  })).filter(session => session.ids.length)
  const queued = pinState(S, override) === 'open' ? override : queueNext(S, iso, today)
  const own = queued || queueLiveOn(S, iso, today)
    ? weekday.map(session => ({ ...session, ids: session.ids.filter(id => !S.queue.ids.includes(id)) }))
      .filter(session => session.ids.length)
    : weekday
  return queued ? [{ slot: 'queue', ids: [queued] }, ...own] : own
}

export const effectiveRoutineIds = (S, iso, today) =>
  effectiveRoutineSessions(S, iso, today).flatMap(session => session.ids)
```

Update `effectiveRoutines`, `effectiveRoutineId`, `effectiveRoutine`, and `nextTrainingDay` to derive from the session API without changing their documented fallback behavior.

- [ ] **Step 4: Update fixed-week tally semantics and tests**

Replace `Object.values(S.week || {}).filter(ids => ownIds(ids).length).length` with a slot-aware count: each non-empty slot after routine existence and live-queue exclusion is one planned session. Preserve the existing queue branch and workout counting rules. Add an assertion that a Wednesday with Morning and Night contributes two planned sessions.

- [ ] **Step 5: Run history and queue suites**

Run: `npm test -- --run src/lib/history.test.js src/lib/queue.test.js`

Expected: PASS.

## Task 3: Make routine deletion and restoration slot-aware

**Files:**
- Modify: `frontend/src/lib/routines.js:21-100`
- Test: `frontend/src/lib/routines.test.js`
- Modify: `frontend/src/views/Plan.jsx:41-118` only if snapshot shape needs adaptation
- Test: `frontend/src/views/Plan.*.test.jsx` existing delete/undo coverage

**Interfaces:**
- `deleteRoutine(s, id)` removes the id from every slot and drops only empty slots/days.
- `routineSnapshot(S, id)` records every `{ weekday, slot, index }` placement.
- `restoreRoutine(s, snapshot)` reinserts the id only into an unchanged/compatible target slot, bounded by current length, without duplicate ids.

- [ ] **Step 1: Add failing pure-routine tests**

```js
it('deletes a routine from one slot without clearing the other slot on its weekday', () => {
  const s = state({ week: { 1: { morning: ['r1'], night: ['r1', 'r2'] } } })
  deleteRoutine(s, 'r1')
  expect(s.week).toEqual({ 1: { night: ['r2'] } })
})

it('restores a deleted routine to each recorded slot and original bounded position', () => {
  const before = state({ week: { 1: { morning: ['r1'], night: ['r2', 'r1'] } } })
  const snap = routineSnapshot(before, 'r1')
  deleteRoutine(before, 'r1')
  expect(restoreRoutine(before, snap)).toBe(true)
  expect(before.week[1]).toEqual({ morning: ['r1'], night: ['r2', 'r1'] })
})
```

- [ ] **Step 2: Run the targeted routine test and confirm failure**

Run: `npm test -- --run src/lib/routines.test.js`

Expected: FAIL against list-only schedule handling.

- [ ] **Step 3: Refactor routine schedule pointers through `schedule-slots.js`**

Replace every direct `[].concat(s.week[d])` read/write in `deleteRoutine`, `routineSnapshot`, and `restoreRoutine` with `daySlotsOf` and `writeSlotIds`. Snapshot a list of placement objects rather than a map of weekday index so two slots on one day remain distinct.

- [ ] **Step 4: Run routine and Plan deletion/Undo tests**

Run: `npm test -- --run src/lib/routines.test.js src/views/Plan*.test.jsx`

Expected: PASS.

## Task 4: Edit and display three independent weekday slots

**Files:**
- Modify: `frontend/src/sheets.jsx:2043-2074`
- Modify: `frontend/src/views/Plan.jsx:249-306,414-417`
- Test: `frontend/src/sheets.day-assign.test.jsx`
- Test: `frontend/src/views/Plan*.test.jsx`
- Modify: relevant locale source and every maintained `frontend/src/locales/*.js` file

**Interfaces:**
- `dayAssignSheet(day)` edits independent slot assignments using `writeSlotIds`.
- UI emits one assignment section per `SCHEDULE_SLOTS` key in exact order.
- `Plan` weekday summaries consume `effectiveRoutineSessions`/`daySlotsOf`, never raw `S.week[day]`.

- [ ] **Step 1: Add failing day-assignment UI tests**

```jsx
it('assigns separate Morning and Night sessions on one weekday', () => {
  renderDayAssign(1)
  chooseSlot('Morning'); tapRoutine('Push')
  chooseSlot('Night'); tapRoutine('Mobility')
  expect(useStore.getState().S.week[1]).toEqual({
    morning: ['push'], night: ['mobility']
  })
})

it('keeps two routines combined when they are assigned to the same slot', () => {
  renderDayAssign(1)
  chooseSlot('Afternoon'); tapRoutine('Push'); tapRoutine('Core')
  expect(useStore.getState().S.week[1].afternoon).toEqual(['push', 'core'])
})
```

Use actual test helpers and accessible labels introduced by the implementation rather than brittle class selectors.

- [ ] **Step 2: Run day assignment tests and confirm failure**

Run: `npm test -- --run src/sheets.day-assign.test.jsx`

Expected: FAIL because the current sheet has one combined routine list.

- [ ] **Step 3: Replace the single assignment list with slot sections**

In `DayAssign`, track no temporary local schedule. For each slot, read `daySlotsOf(st.week, day)[slot]`; tapping a routine toggles it only inside that slot via `writeSlotIds`. Render the rest state as an empty section rather than a destructive global “Rest day” row. Keep one Done action.

- [ ] **Step 4: Update Plan summaries and routine subtitles**

Render a compact list of `Morning — Push + Core`, `Night — Mobility`; render Rest only when no slot has routines. Update the fixed-week help copy to distinguish combined same-slot routines from separate time-slot sessions. Update the Routines tab subtitle to show the routine’s weekday/slot placements.

- [ ] **Step 5: Add localized source keys and verify locale completeness**

Add English keys for Morning, Afternoon, Night, slot descriptions, “Separate sessions”, and slot-aware scheduling helper copy. Add equivalent keys to every locale file following existing locale-test conventions; do not leave English literals in the rendered UI.

- [ ] **Step 6: Run focused UI/localization tests**

Run: `npm test -- --run src/sheets.day-assign.test.jsx src/views/Plan*.test.jsx src/locales/*.test.*`

Expected: PASS.

## Task 5: Select one time-slot session when starting a workout

**Files:**
- Modify: `frontend/src/sheets.jsx` near `startFlow`/`beginWorkout`
- Modify: `frontend/src/views/Home.jsx`
- Modify: `frontend/src/components/TabBar.jsx`
- Modify: `frontend/src/views/Workout.jsx`
- Test: `frontend/src/views/Home*.test.jsx`, `frontend/src/views/Workout.test.jsx`, `frontend/src/sheets.combine.test.jsx`

**Interfaces:**
- Produces `startPlannedSession(S, iso)` (or equivalent) that starts directly when exactly one session is trainable and opens a sheet/menu when two or more are trainable.
- Each menu option calls existing `startFlow(session.ids)`, preserving current workout creation behavior.
- Queue and date-override sessions have a meaningful label and retain their current direct-start semantics when they are the only session.

- [ ] **Step 1: Add failing interaction tests**

```jsx
it('offers independently scheduled sessions instead of starting a combined workout', () => {
  install({ week: { [todayDow]: { morning: ['push'], night: ['mobility'] } } })
  clickStart()
  expect(openSheet).toHaveBeenCalled()
  chooseSheetAction('Morning')
  expect(startFlow).toHaveBeenCalledWith(['push'])
})

it('still starts one Morning session directly', () => {
  install({ week: { [todayDow]: { morning: ['push'] } } })
  clickStart()
  expect(startFlow).toHaveBeenCalledWith(['push'])
})
```

- [ ] **Step 2: Run start-flow tests and confirm failure**

Run: `npm test -- --run src/views/Home*.test.jsx src/views/Workout.test.jsx src/sheets.combine.test.jsx`

Expected: FAIL because all daily ids are currently flattened into one `startFlow` call.

- [ ] **Step 3: Implement the scheduled-session picker**

Build it with existing `menuSheet`/sheet primitives. The option label contains the translated slot name plus the derived routine session name; its subtitle contains routine/exercise count. Filter sessions with no valid routine exercises in the same way TabBar does today. Do not change `beginWorkout`; it already correctly consumes one routine-id list and produces a combined session only for that list.

- [ ] **Step 4: Replace direct planned-start call sites**

Make Home, TabBar, and Workout’s empty/start-door use the slot-aware starter. Keep explicit “another routine” and freestyle paths unchanged. Calendar progress may continue to use the flattened helper for planned/not-planned presentation.

- [ ] **Step 5: Run focused start/session suites**

Run: `npm test -- --run src/views/Home*.test.jsx src/views/Workout*.test.jsx src/components/TabBar*.test.jsx src/sheets.combine.test.jsx src/sheets.plan-session.test.jsx`

Expected: PASS.

## Task 6: Preserve schedules through sharing, printing, Coach, rotation, server reminder and sync

**Files:**
- Modify: `frontend/src/lib/plan-share.js:177-301,371-380`
- Test: `frontend/src/lib/plan-share.test.js`, `frontend/src/lib/plan-print.test.js`
- Modify: `frontend/src/lib/coach.js` and `frontend/src/lib/coach.test.js`
- Modify: `frontend/src/lib/rotation.js` plus focused rotation tests if it directly reads `S.week`
- Modify: `frontend/src/lib/sync-merge.js`, `api/sync-stamps.js`, their tests
- Modify: `api/queue.js`, `api/test/server-nudge.test.js`
- Test: `api/test/server-data-reset.test.js` and relevant API state PUT tests

**Interfaces:**
- `buildPlanBundle` exports canonical sparse slot objects.
- `parsePlan` accepts both legacy and canonical slots and reports scheduled day count by non-empty weekday.
- `mergePlan` maps each imported slot’s old ids through `ridMap` and writes with `writeSlotIds`.
- API reminder selects the first valid id in Morning → Afternoon → Night, retaining one daily push.
- Sync treats the full `week` schedule as a stamped setting unless the existing per-day merge strategy is extended consistently; it must never coerce slot objects into arrays.

- [ ] **Step 1: Add failing share/import/print regression tests**

```js
it('round-trips time slots through an exported plan', () => {
  const bundle = parsePlan(buildPlanBundle(source({ week: { 1: { morning: ['a'], night: ['b'] } } }), 'Plan'))
  expect(bundle.week[1]).toEqual({ morning: ['a'], night: ['b'] })
  const target = freshTarget()
  mergePlan(target, bundle, { schedule: true })
  expect(target.week[1]).toEqual({ morning: [target.routines[0].id], night: [target.routines[1].id] })
})

it('prints time-slot labels beside their routine names', () => {
  expect(text(planPrintHTML(source({ week: { 1: { night: ['a'] } } }), 'Ana'))).toContain('Night')
})
```

Add a legacy array plan-import test proving it lands in Morning.

- [ ] **Step 2: Run sharing tests and confirm failure**

Run: `npm test -- --run src/lib/plan-share.test.js src/lib/plan-print.test.js`

Expected: FAIL because export/print currently calls `[].concat` on every day value.

- [ ] **Step 3: Implement slot-aware sharing and print rendering**

Use `normalizeWeekSlots` at parse/export boundaries. On merge, replace only schedule keys and map each slot list separately through `ridMap`. Print one day row per weekday; its right-side value includes translated slot labels in `Morning — Push; Night — Mobility` form, or Rest.

- [ ] **Step 4: Migrate Coach and rotation raw-week access**

Coach canonical serialization and change application must use Morning as the default for legacy one-routine AI recommendations, while preserving other slots when a single Coach weekday change is applied. Rotation’s fixed-week “extra routines” logic must operate on slot sessions and keep queue-owned routine ids excluded.

- [ ] **Step 5: Make sync/API state and reminder tolerant**

Update frontend and API stamp/merge readers so a slot object remains an object across a PUT, conflict merge and two-device synchronization. Add a server state round-trip fixture with canonical slots. In `api/queue.js`, replace the direct `[].concat(S.week?.[wd])` fallback with `weekdayIdsOf`-equivalent local logic and select only the first valid routine, retaining the one-reminder contract.

- [ ] **Step 6: Run sharing, sync, API and Coach/rotation tests**

Run: `npm test -- --run src/lib/plan-share.test.js src/lib/plan-print.test.js src/lib/coach.test.js src/lib/rotation.test.js src/lib/sync-merge.test.js`

Then run from `api/`: `npm test` (defined as `node --test test/*.test.js`). Expected: both commands PASS.

## Task 7: Implement pure exercise transfer and conflict-aware Undo

**Files:**
- Modify: `frontend/src/lib/routines.js`
- Test: `frontend/src/lib/routines.test.js`
- Modify: `frontend/src/views/RoutineEdit.jsx:322-360,392-418,500-546`
- Test: Create `frontend/src/views/RoutineEdit.transfer.test.jsx`

**Interfaces:**
- Produces `moveRoutineExercise(S, { sourceRoutineId, sourceIndex, targetRoutineId }) -> snapshot | null` that mutates only the supplied state draft after validating both distinct routines and source occurrence.
- Produces `undoMoveRoutineExercise(S, snapshot) -> boolean`.
- Snapshot contains source/target ids, source index, target insertion index, `beforeSource`, `beforeTarget`, `afterSource`, `afterTarget`, and a clone/fingerprint of the moved occurrence.

- [ ] **Step 1: Add failing pure transfer tests**

```js
it('moves one configured occurrence to the target tail and clears only its old superset link', () => {
  const source = routine('source', [entry('a', { sg: 'g', note: 'keep', warmupSets: 2 }), entry('b', { sg: 'g' })])
  const target = routine('target', [entry('c')])
  const s = state({ routines: [source, target] })
  const snap = moveRoutineExercise(s, { sourceRoutineId: 'source', sourceIndex: 0, targetRoutineId: 'target' })
  expect(s.routines[0].ex).toEqual([entry('b')])
  expect(s.routines[1].ex.at(-1)).toMatchObject({ id: 'a', note: 'keep', warmupSets: 2 })
  expect(s.routines[1].ex.at(-1).sg).toBeUndefined()
  expect(undoMoveRoutineExercise(s, snap)).toBe(true)
  expect(s.routines[0].ex).toEqual(source.ex)
})

it('falls back safely when target changed after transfer', () => {
  // transfer, append another target item, then undo: remove only the identified moved occurrence
  // and reinsert its clone at the source’s bounded original position.
})
```

Cover duplicate exercise ids by selecting the source index, full configuration cloning, deleted target/source routine, self-target rejection, exact-list restore, and stale-state fallback.

- [ ] **Step 2: Run pure routine tests and confirm failure**

Run: `npm test -- --run src/lib/routines.test.js`

Expected: FAIL because transfer helpers do not exist.

- [ ] **Step 3: Implement pure transfer helpers**

Use `structuredClone` for both full pre/post lists and the moved occurrence. Remove source by index, delete its `sg`, run `cleanupSg(source.ex)`, append the clone to the target, and return the snapshot. For Undo, restore both saved lists only when current serialized lists match `afterSource`/`afterTarget`; otherwise find the exact appended moved occurrence by stable JSON fingerprint, remove it only when uniquely found, reinsert the saved clone at `Math.min(sourceIndex, currentSource.length)`, then run `cleanupSg`.

Do not use exercise id alone for the fallback: duplicate exercises are valid.

- [ ] **Step 4: Add failing RoutineEdit transfer UI test**

```jsx
it('offers every other routine as a transfer target and exposes Undo', () => {
  setRoutines([routine('r1', [entry('c1', { note: 'setup' })]), routine('r2', [])])
  renderRoutine('/routine/r1')
  openExerciseActions('setup')
  clickText('Move to routine')
  expect(targetLabels()).toEqual(['Routine 2'])
  clickText('Routine 2')
  expect(useStore.getState().S.routines[1].ex[0]).toMatchObject({ id: 'c1', note: 'setup' })
  invokeToastAction('Undo')
  expect(useStore.getState().S.routines[0].ex[0]).toMatchObject({ id: 'c1', note: 'setup' })
})
```

- [ ] **Step 5: Add the editor action without breaking existing row gestures**

Add “Move to routine” to the existing exercise action surface/sheet, not as a bare row tap. The target picker uses existing `menuSheet` or an equivalent project picker, filters out `id`, validates the current source occurrence just before update, calls the pure helper inside one store `update`, and shows an Undo toast whose action invokes the pure undo helper inside `update`.

- [ ] **Step 6: Add localized/accessibility copy and run focused tests**

Add strings for Move to routine, target picker title, confirmation and no-safe-undo condition. Verify keyboard/focus behavior alongside the established move-control tests.

Run: `npm test -- --run src/lib/routines.test.js src/views/RoutineEdit.transfer.test.jsx src/views/RoutineEdit.move.test.jsx`

Expected: PASS.

## Task 8: Full verification and manual evidence

**Files:**
- Modify only if test failures reveal a required defect in the above task scope.

- [ ] **Step 1: Run all frontend tests**

Run: `npm test`

Expected: PASS. If failures occur in untouched tests, diagnose whether they are a schedule-shape expectation requiring intentional update or a pre-existing/worktree failure; do not hide them.

- [ ] **Step 2: Run production and mobile builds**

Run: `npm run build && npm run build:mobile`

Expected: both builds complete successfully. If Android/Capacitor prerequisites are unavailable, record the exact missing prerequisite and still verify the web build.

- [ ] **Step 3: Run API test suite**

Run from `api/`: `npm test`, which invokes `node --test test/*.test.js`; include the state PUT/merge and notification tests.

Expected: PASS, including legacy week and canonical slot fixtures.

- [ ] **Step 4: Run local browser smoke verification**

Start the existing frontend dev server using the documented script, wait for an HTTP success response, and use the browser harness to verify:

1. One weekday can hold a Morning and Night routine.
2. Starting Morning starts only its routine; Night starts only its routine.
3. Two routines placed in one slot start as one combined workout.
4. Moving a configured exercise changes source/target as described and Undo restores it.
5. Reload preserves the schedule and transfer state.

- [ ] **Step 5: Inspect final diff and report verified evidence**

Run: `git diff --check` and `git status --short`.

Report changed paths, exact test/build commands with pass/fail output, browser checks performed, and any verified blockers. Do not commit unless the user explicitly asks.
