# Gym&Me Routine Transfer and Time-Slot Scheduling Design

## Decision

Gym&Me will support three independent weekly training slots for every weekday: **Morning**, **Afternoon**, and **Night**. A user can schedule one or more routines in each slot. Each non-empty slot is a separate planned session; routines in the same slot remain a combined session in their listed order.

Routine editors will gain an explicit **Move to routine** action for an individual exercise. It transfers the selected configured exercise to a different routine rather than copying it.

The existing single daily reminder stays unchanged in this release. Slot-specific notification times are intentionally out of scope.

## Goals

1. Schedule distinct routines on the same weekday without accidentally combining them into one workout.
2. Preserve all existing schedules and routine data during upgrade.
3. Move an exercise between routines without re-entering sets, reps, load, notes, progression, warm-ups, rest or intensifier settings.
4. Keep offline persistence, browser/mobile backup, plan export/import, server sync and older saved profiles safe.
5. Leave historic workouts immutable: changing future routine structure never rewrites logged sessions.

## Non-goals

- Exact times or per-slot push notifications.
- Calendar-date scheduling changes; existing date overrides and rotation queues retain their current behaviour.
- Moving whole supersets between routines. The operation is deliberately one exercise at a time.
- Copying an exercise. Existing duplication/picker flows remain available where needed.
- Reworking the rotation scheduling model beyond ensuring slot data survives it.

## Data model and migration

The current canonical weekly schedule is a weekday-to-routine-id list, where multiple routine ids form one combined session:

```js
week: { 1: ['push', 'core'] }
```

It becomes a weekday-to-slots object:

```js
week: {
  1: {
    morning: ['push'],
    afternoon: ['core'],
    night: []
  }
}
```

Rules:

- Slot keys are `morning`, `afternoon`, and `night`, always rendered in that order.
- Missing weekday keys and missing slot keys mean rest; empty arrays are normalized away when persisted.
- A slot holds routine ids in its session order. Several routines in a slot therefore retain current combined-session semantics.
- On loading a legacy weekday array or string, normalize it into that weekday's `morning` slot. This preserves every routine and its prior combined-session order.
- All schedule readers use one normalization/helper layer. No view, export, queue, coach, reminder or session-start path reads raw `S.week[day]` directly after this change.
- Saving or syncing a normalized schedule writes only the new slot shape. Old clients may render it as a rest day, but they must not delete the unrecognized structure; the current sync merge must explicitly preserve and merge the new shape.
- Existing `dayPlan` date overrides continue to represent one date-specific routine/rest override. They are not silently converted into time slots in this release. A date override remains a deliberately explicit alternative to the weekly plan.

## Schedule UX

### Plan → Schedule

Fixed Week renders each weekday with the populated slot summary, for example:

- Monday: Morning — Push; Night — Mobility
- Tuesday: Rest

Tapping a weekday opens a slot-aware assignment sheet with Morning, Afternoon and Night sections. Each section:

- Shows routines presently assigned to that slot in workout order.
- Lets the user add/remove routines independently of the other slots.
- Offers a clear rest state when empty.
- Keeps the sheet open until Done, allowing a user to schedule several slots at once.

Existing day wording such as “Want two routines on one day?” changes to explain that routines in the same slot are trained together, while routines in separate slots are separate sessions.

### Home and session start

For a fixed-week day with several populated slots, the app exposes the distinct sessions rather than flattening them into one combined workout. Starting a session records only the routines from the selected slot. A single populated slot preserves current one-tap behaviour.

Routine list summaries show scheduled days and populated time slots, rather than only a comma-separated day list.

### Rotation and overrides

Rotation retains its current single next-session model. Fixed-week slots can still appear as extra planned sessions according to existing fixed-day/rotation rules, but they cannot be silently merged into a rotation workout. Date overrides remain one explicit override as described above.

## Exercise transfer UX

Every exercise row in `RoutineEdit` exposes **Move to routine** alongside its existing edit, replace, reorder and remove controls.

1. The user selects Move to routine.
2. A target-routine picker lists every routine except the source.
3. Selecting a target transfers the exact selected occurrence and appends it to the target routine's exercise list.
4. The source occurrence is removed. `cleanupSg` runs on the source so a split or one-member superset is repaired safely. The moved entry has no source superset link in its new routine; it is a standalone exercise until the user links it there.
5. A toast confirms the source and target and offers Undo.

Transfer preserves the complete exercise entry configuration, including custom exercise ids, sets, reps, rep range, load, unit-independent config, notes, progression overrides, tempo, speed, warm-ups, rest, bodyweight flags and intensifiers. The target receives a cloned entry so later edits cannot alias source state.

Undo is conflict-aware:

- If the source and target exercise lists are still exactly in the post-transfer state, Undo restores both lists exactly, including original superset links and positions.
- If either list changed locally or by sync, Undo removes the matching moved occurrence from the target when safe and restores it at its original bounded source position, followed by superset cleanup.
- If a routine was deleted or the moved occurrence can no longer be identified safely, Undo reports that it is too late and makes no destructive change.

## Sync, sharing and persistence

The schedule migration affects the state schema and must be integrated with:

- `useStore` load/save and native file backup/restore paths.
- State stamping and conflict merging (`sync-merge.js`, `sync-stamps.js`) so one device's slot change does not erase another day's changes.
- The Node API's state validation/normalization, which must accept legacy schedules and the new slot form without dropping routines.
- Plan export/import and printed plans. Exported plans include slots; importing older exported plans maps their weekday routines to Morning.
- Coach/plan changes, queue/rotation utilities, aggregate weekly volume and user-visible routine summaries.

Data is normalized at every system boundary rather than using a one-off destructive migration. A profile that remains offline, restores an old backup, or receives an older plan is safe when first opened by the new client.

## Localization and accessibility

English source strings will be added for all labels, descriptions, confirmations and Undo/failure messages. Every maintained locale receives matching entries or the project’s established fallback. Slot controls and the transfer picker have explicit accessible names and keyboard-operable buttons.

## Error handling

- Moving to the source routine is not offered.
- A stale source or target routine closes the picker without changing data.
- An unavailable/deleted source occurrence is a no-op.
- Invalid, unknown or duplicate routine ids in saved schedules are ignored for rendering but preserved only where the existing sync policy requires; no invalid id starts a workout.
- Schedule normalization never converts an unrecognized non-empty value into a rest day without preserving/recovering it according to existing sync safety rules.

## Verification requirements

### Unit and state tests

- Legacy strings and arrays normalize into a Morning slot without data loss.
- New schedule normalization removes empty slots/day keys and preserves ordered multi-routine slots.
- Sync merge preserves concurrent edits to separate weekdays and does not drop slot data through API read/write.
- Backup restore and plan import handle both legacy and slot-aware schedules.
- Export/print reflect morning, afternoon and night correctly.
- Routine transfer preserves every exercise field, clones its entry, cleans source supersets and leaves target ordering correct.
- Undo restores exact untouched lists and follows the safe fallback under changed state.

### UI tests

- Day assignment can independently set/clear Morning, Afternoon and Night on a single weekday.
- Same-slot routines form one session; different-slot routines are offered as separate sessions.
- Routine editor shows no invalid self-target, selects a target routine, confirms the move and exposes Undo.
- All added English and non-English locale keys are covered by existing locale tests.

### End-to-end checks

- Run the frontend Vitest suite and production build.
- Run relevant API tests, including a legacy-state read/write round-trip.
- Manual browser smoke test: schedule two Monday slots, start each separate session, move an exercise between routines, undo it, reload and confirm persistence.
- Before claiming mobile support, run the mobile build and verify the state round-trip on the existing Android test path.

## Files expected to change

The exact plan follows after review, but implementation is expected to touch the schedule helpers and consumers in `frontend/src/lib/`, `frontend/src/store/useStore.js`, `frontend/src/views/Plan.jsx`, `frontend/src/views/RoutineEdit.jsx`, `frontend/src/sheets.jsx`, plan-sharing/printing code, sync/API validation, locales, and focused tests. Existing uncommitted recovery, media and localisation work is outside this feature and must not be overwritten.
