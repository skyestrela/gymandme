# Gym&Me Health Connect and HealthKit Bridges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in native health integration that imports/exports only body weight and completed workouts through Android Health Connect and iOS HealthKit without affecting browser/PWA operation or duplicating data.

**Architecture:** A JavaScript contract and reconciliation layer own validation, conflict policy and Settings state. Local Capacitor Java and Swift plugins implement that contract with platform-specific SDKs. Native connection metadata remains private to a phone; imported Gym&Me entries use the existing profile sync only after the user sees the disclosure.

**Tech Stack:** React 19, Zustand, Capacitor 7, Java/Android Health Connect, Swift/HealthKit, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-10-07-gym-and-me-design.md`

## Global Constraints

- Native targets are Android Health Connect and iOS HealthKit; web/PWA must remain fully functional without either SDK.
- Version one requests only body mass and completed workout permissions; no steps, calories, heart rate, sleep, routes, medical data or background-read permission.
- Never send Health Connect/HealthKit account credentials, record tokens or permission state to the Gym&Me server.
- Native cursors and export-ID mappings live in a private device file named `gymandme-health.json`, never in synced profile state or a profile export.
- Health imports must use an explicit disclosure because paired Gym&Me profiles sync resulting weight/workout entries to the user-owned server.
- A manual Gym&Me weigh-in wins over an imported external weight for the same calendar day.
- Do not invent sets, reps, loads, calories, heart rate or routes for an imported workout.
- Android dependency is `androidx.health.connect:connect-client:1.2.0-alpha04`; check availability at runtime.
- iOS deployment target remains 15.5; HealthKit capability and purpose strings are mandatory before a device build.

---

### Task 1: Define and test the shared health bridge contract

**Files:**
- Create: `frontend/src/lib/health.js`
- Create: `frontend/src/lib/health.test.js`
- Modify: `frontend/src/lib/mobile.js: 52-87`

**Interfaces:**
- Produces: `healthBridge() -> Promise<{ Health: HealthPlugin } | null>`.
- Produces: `healthStatus()`, `requestHealthPermissions()`, `readHealthRecords({ since })`, `writeHealthRecords({ weights, workouts })`, and `openHealthSettings()`.
- Health record DTO: `WeightDTO = { externalId, measuredAt, kg, source, modifiedAt }`.
- Health record DTO: `WorkoutDTO = { externalId, startedAt, endedAt, activity, source, modifiedAt }`.
- Status DTO: `{ platform, available, needsInstall, permissions: { readWeight, writeWeight, readWorkout, writeWorkout }, message }`.

- [ ] **Step 1: Write failing contract tests with a mocked Capacitor plugin**

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('./mobile.js', () => ({ MOBILE: true, isAndroid: vi.fn(async () => true) }))
vi.mock('@capacitor/core', () => ({ registerPlugin: vi.fn(() => ({ status: vi.fn(async () => ({ available: true })) })) }))

import { healthStatus, normalizeWeight } from './health.js'

describe('health bridge', () => {
  it('does not load a native plugin in a browser build', async () => {
    // Separate test module mock sets MOBILE false.
    await expect(healthStatus()).resolves.toMatchObject({ available: false })
  })
  it('normalizes an external weight to kilograms and rejects invalid values', () => {
    expect(normalizeWeight({ externalId: 'h-1', measuredAt: '2026-10-07T10:00:00Z', kg: 80 })).toMatchObject({ kg: 80 })
    expect(() => normalizeWeight({ externalId: '', kg: -1 })).toThrow('invalid health weight')
  })
})
```

- [ ] **Step 2: Run and verify failure**

Run: `cd frontend && npx vitest run src/lib/health.test.js`

Expected: FAIL because `health.js` is absent.

- [ ] **Step 3: Implement a browser-safe contract wrapper**

```js
export async function healthBridge() {
  if (!MOBILE) return null
  const { registerPlugin } = await import('@capacitor/core')
  return { Health: registerPlugin('Health') }
}

export async function healthStatus() {
  const bridge = await healthBridge()
  return bridge ? bridge.Health.status() : { platform: 'web', available: false, needsInstall: false, permissions: {} }
}
```

Validate all native DTOs at the JavaScript boundary before reconciliation. Return a usable error status rather than throw for unavailable/denied platforms; throw only malformed bridge payloads.

- [ ] **Step 4: Run focused tests**

Run: `cd frontend && npx vitest run src/lib/health.test.js src/lib/mobile.test.js --no-file-parallelism --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add frontend/src/lib/health.js frontend/src/lib/health.test.js frontend/src/lib/mobile.js
git commit -m "feat: add cross-platform health bridge contract"
```

### Task 2: Implement tested reconciliation, private metadata, and duplicate protection

**Files:**
- Create: `frontend/src/lib/health-sync.js`
- Create: `frontend/src/lib/health-sync.test.js`
- Modify: `frontend/src/lib/mobile.js: readJsonFile/writeJsonFile helpers`
- Modify: `frontend/src/store/useStore.js: update call site only if reconciliation writes accepted records`

**Interfaces:**
- Produces: `HEALTH_FILE = 'gymandme-health.json'`.
- Produces: `defaultHealthMeta() -> { version: 1, imported: {}, exported: {}, lastReadAt: null, disclosureAccepted: false }`.
- Produces: `reconcileHealthImport(state, meta, payload, now) -> { state, meta, importedWeights, importedWorkouts, skippedManualWeightDays, skippedDuplicates }`.
- Produces: `exportableHealthRecords(state, meta) -> { weights: WeightDTO[], workouts: WorkoutDTO[] }`.
- Consumes: state shape `S.bodyweight`, `S.workouts`, `update(mutator, push)` and private JSON helpers.

- [ ] **Step 1: Write failure-first reconciliation tests**

```js
it('keeps a manual weight when Health has a newer value for the same local date', () => {
  const state = { unit: 'kg', bodyweight: [{ d: '2026-10-07', w: 80 }], workouts: [] }
  const out = reconcileHealthImport(state, defaultHealthMeta(), {
    weights: [{ externalId: 'hc:weight:7', measuredAt: '2026-10-07T12:00:00Z', kg: 79, source: 'Health Connect' }], workouts: []
  }, new Date('2026-10-07T12:10:00Z'))
  expect(out.state.bodyweight).toEqual([{ d: '2026-10-07', w: 80 }])
  expect(out.skippedManualWeightDays).toEqual(['2026-10-07'])
})

it('imports a workout once even when native reads return it twice', () => {
  const record = { externalId: 'hk:workout:9', startedAt: '2026-10-07T09:00:00Z', endedAt: '2026-10-07T10:00:00Z', activity: 'strength', source: 'Apple Health' }
  const first = reconcileHealthImport({ bodyweight: [], workouts: [] }, defaultHealthMeta(), { weights: [], workouts: [record] }, new Date())
  const second = reconcileHealthImport(first.state, first.meta, { weights: [], workouts: [record] }, new Date())
  expect(second.state.workouts).toHaveLength(1)
  expect(second.skippedDuplicates).toBe(1)
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `cd frontend && npx vitest run src/lib/health-sync.test.js`

Expected: FAIL because reconciliation is absent.

- [ ] **Step 3: Implement the deterministic data rules**

Use device-local metadata keyed by `externalId`. Convert all native values to kilograms and ISO timestamps before comparison. Never mutate a manual same-day bodyweight entry. For imported workouts, create a normal completed workout with `entries: []`, start/end timestamps, an explicit `healthImport` object `{ externalId, source, activity }`, and a human-readable imported name. The reconciliation layer must never manufacture exercise detail.

Load/store metadata through `readJsonFile(HEALTH_FILE)` and `writeJsonFile(HEALTH_FILE, meta)`. Only accepted profile mutations call the existing `update(..., true)` path; metadata writes never enter `S`.

- [ ] **Step 4: Run test suite**

Run: `cd frontend && npx vitest run src/lib/health-sync.test.js src/store/useStore.sync.test.jsx --no-file-parallelism --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit reconciliation**

```bash
git add frontend/src/lib/health-sync.js frontend/src/lib/health-sync.test.js frontend/src/lib/mobile.js frontend/src/store/useStore.js
git commit -m "feat: reconcile health records without duplicates"
```

### Task 3: Add the Gym&Me mobile Health settings UX and disclosure

**Files:**
- Create: `frontend/src/components/HealthConnection.jsx`
- Create: `frontend/src/components/HealthConnection.test.jsx`
- Modify: `frontend/src/views/Settings.jsx`
- Modify: `frontend/src/views/settings-pages.js`
- Modify: locale string catalogues used by `t()`

**Interfaces:**
- Consumes: health bridge/status APIs and `reconcileHealthImport()`.
- Produces: mobile-only Settings route/row named `Health data`.
- Produces: actions `Connect`, `Sync now`, `Disconnect`, and `Manage access`.

- [ ] **Step 1: Write failing Settings tests**

```jsx
it('shows only the two requested record classes before consent', async () => {
  render(<HealthConnection />)
  expect(await screen.findByText('Body weight and completed workouts')).toBeTruthy()
  expect(screen.queryByText('Steps')).toBeNull()
  expect(screen.queryByText('Heart rate')).toBeNull()
})

it('requires disclosure acceptance before importing records into a paired profile', async () => {
  render(<HealthConnection paired />)
  await userEvent.click(screen.getByRole('button', { name: 'Sync now' }))
  expect(await screen.findByText(/will sync to your Gym&Me account/)).toBeTruthy()
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `cd frontend && npx vitest run src/components/HealthConnection.test.jsx`

Expected: FAIL because component and route do not exist.

- [ ] **Step 3: Implement mobile-only UX**

Use the existing Settings `Section`, `Row`, `Button`, sheet and toast patterns. Browser/PWA users must not see a broken plugin control. The mobile screen reports platform availability, requested permissions, last successful sync and skipped-conflict counts. Disconnect stops future reads/writes and clears the private metadata only after confirmation; it does not delete ordinary Gym&Me workouts/weights already imported.

- [ ] **Step 4: Run Settings/component tests**

Run: `cd frontend && npx vitest run src/components/HealthConnection.test.jsx src/views/settings-pages.test.jsx --no-file-parallelism --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit Settings UX**

```bash
git add frontend/src/components/HealthConnection.jsx frontend/src/components/HealthConnection.test.jsx frontend/src/views/Settings.jsx frontend/src/views/settings-pages.js frontend/src/components/locales
git commit -m "feat: add private health connection controls"
```

### Task 4: Implement Android Health Connect bridge and required manifest configuration

**Files:**
- Create: `frontend/android/app/src/main/java/com/gymandme/app/HealthPlugin.java`
- Create: `frontend/android/app/src/main/java/com/gymandme/app/PermissionsRationaleActivity.java`
- Modify: `frontend/android/app/src/main/java/com/gymandme/app/MainActivity.java`
- Modify: `frontend/android/app/build.gradle:46-56`
- Modify: `frontend/android/app/src/main/AndroidManifest.xml`
- Test: `frontend/src/lib/health.test.js`
- Test: `frontend/src/lib/health-native-config.test.js`

**Interfaces:**
- Android plugin name is exactly `Health`.
- Exposes `status`, `requestPermissions`, `read`, `write`, `openSettings`, and `disconnect` Capacitor methods matching Task 1 DTOs.
- Uses `WeightRecord` and `ExerciseSessionRecord`; no other health record class is imported.

- [ ] **Step 1: Write source/configuration tests before native implementation**

```js
it('declares only required Android Health permissions and rationale handling', () => {
  const manifest = readFileSync(new URL('../../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')
  expect(manifest).toContain('android.permission.health.READ_WEIGHT')
  expect(manifest).toContain('android.permission.health.WRITE_WEIGHT')
  expect(manifest).toContain('android.permission.health.READ_EXERCISE')
  expect(manifest).toContain('android.permission.health.WRITE_EXERCISE')
  expect(manifest).not.toContain('READ_HEART_RATE')
  expect(manifest).not.toContain('READ_STEPS')
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `cd frontend && npx vitest run src/lib/health-native-config.test.js`

Expected: FAIL because Health Connect configuration is missing.

- [ ] **Step 3: Add Health Connect dependency and a Java Capacitor plugin**

Add exactly:

```gradle
implementation "androidx.health.connect:connect-client:1.2.0-alpha04"
```

`HealthPlugin` must call `HealthConnectClient.getSdkStatus(context)` before every operation. It returns `available: false, needsInstall: true` for a supported unavailable device and opens the relevant settings/install path only on explicit user action. It requests only the four declared permissions, checks grants again before read/write, translates `WeightRecord` to kilograms and `ExerciseSessionRecord` to the Task 1 DTO, and marks Gym&Me outputs with stable client record IDs prefixed `gymandme:`.

Add manifest declarations for the four requested permissions, the Health Connect package query, privacy rationale activity for Android 13 and lower, Android 14 permission-usage activity alias, and no heart-rate/steps/background permissions. Register `HealthPlugin.class` in `MainActivity.onCreate()` before `super.onCreate()`.

- [ ] **Step 4: Run static and Android build verification**

Run:

```bash
cd frontend
npx vitest run src/lib/health-native-config.test.js src/lib/health.test.js
npm run build:mobile
cd android && ./gradlew assembleDebug
```

Expected: JS tests and Gradle debug build pass on a machine with Java/Android SDK. On this WSL host, record missing toolchain instead of claiming a native build.

- [ ] **Step 5: Commit Android bridge**

```bash
git add frontend/android frontend/src/lib/health-native-config.test.js frontend/src/lib/health.test.js
git commit -m "feat: add Android Health Connect bridge"
```

### Task 5: Implement iOS HealthKit bridge, entitlement and privacy copy

**Files:**
- Create: `frontend/ios/App/App/HealthPlugin.swift`
- Create: `frontend/ios/App/App/GymAndMe.entitlements`
- Modify: `frontend/ios/App/App/Info.plist`
- Modify: `frontend/ios/App/App.xcodeproj/project.pbxproj`
- Test: `frontend/src/lib/health-native-config.test.js`

**Interfaces:**
- iOS plugin bridge name is exactly `Health`.
- Exposes the same `status`, `requestPermissions`, `read`, `write`, `openSettings`, and `disconnect` methods as Android.
- Uses only `HKQuantityType.quantityType(forIdentifier: .bodyMass)` and `HKWorkoutType.workoutType()`.

- [ ] **Step 1: Extend native configuration test to cover iOS privacy requirements**

```js
it('declares HealthKit capability and explicit body-weight/workout purpose strings', () => {
  const plist = readFileSync(new URL('../../ios/App/App/Info.plist', import.meta.url), 'utf8')
  const entitlements = readFileSync(new URL('../../ios/App/App/GymAndMe.entitlements', import.meta.url), 'utf8')
  expect(plist).toContain('NSHealthShareUsageDescription')
  expect(plist).toContain('NSHealthUpdateUsageDescription')
  expect(entitlements).toContain('com.apple.developer.healthkit')
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `cd frontend && npx vitest run src/lib/health-native-config.test.js`

Expected: FAIL because entitlement/plugin/purpose strings are missing.

- [ ] **Step 3: Implement the local Swift bridge**

Create a `CAPPlugin` called `HealthPlugin`, backed by one `HKHealthStore`. Authorize only body mass and workouts. Read with date predicates and external UUID metadata; write body mass in kilograms and `HKWorkout` sessions tagged with an external identifier `gymandme:<id>`. Return Task 1 DTOs on the Capacitor main-safe completion path. Do not infer exercise sets or physiological metrics.

Add `NSHealthShareUsageDescription` and `NSHealthUpdateUsageDescription` that truthfully state that Gym&Me reads/writes body weight and completed workouts, and that imported Gym&Me entries can sync to the person’s own Gym&Me server/account. Add the HealthKit entitlement and register the Swift file/entitlement in the Xcode project for both Debug and Release, including `CODE_SIGN_ENTITLEMENTS = App/GymAndMe.entitlements;`.

- [ ] **Step 4: Run source tests and perform Mac-only build**

Run:

```bash
cd frontend && npx vitest run src/lib/health-native-config.test.js src/lib/health.test.js
cd ios && pod install
xcodebuild -workspace App.xcworkspace -scheme App -sdk iphonesimulator -configuration Debug build
```

Expected: static tests pass everywhere; Xcode build is performed only on macOS with Xcode.

- [ ] **Step 5: Commit iOS bridge**

```bash
git add frontend/ios frontend/src/lib/health-native-config.test.js
git commit -m "feat: add Apple HealthKit bridge"
```

### Task 6: Verify device sync, privacy behavior, and release documentation

**Files:**
- Create: `docs/HEALTH.md`
- Modify: `docs/MOBILE.md`
- Modify: `docs/GYMANDME_LOCAL.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed native bridges, Settings UX, existing device pairing and server sync.
- Produces: accurate operator and phone-user instructions with no claim that untested hardware behavior was verified.

- [ ] **Step 1: Document exact test matrix before testing hardware**

```markdown
| Case | Android expectation | iPhone expectation |
| --- | --- | --- |
| Unsupported/unavailable | normal app remains usable; connect explains availability | n/a on supported iOS |
| Permission denied | no import/export; Manage access remains available | no import/export; Health settings remains available |
| Weight import | one accepted record per empty day | one accepted record per empty day |
| Manual same-day weight | manual Gym&Me weight remains unchanged | manual Gym&Me weight remains unchanged |
| Imported workout re-read | no duplicate | no duplicate |
| Paired offline edit | syncs and is visible in browser after reconnect | syncs and is visible in browser after reconnect |
```

- [ ] **Step 2: Run full automated verification**

Run:

```bash
cd frontend && npm test -- --no-file-parallelism --maxWorkers=1
cd ../api && npm test
cd ../mcp && npm test
cd ../frontend && npm run build && npm run build:mobile
```

Expected: all available automated tests/builds pass. List any platform build blocked by missing host toolchains.

- [ ] **Step 3: Perform real-device tests**

Use a non-production test profile. Pair the app against a real HTTPS Gym&Me instance, import one native weight and one completed workout, refresh the browser and verify both records, create an offline phone entry, reconnect, verify merge, then disable Health access and confirm ordinary Gym&Me logging/sync remains functional.

- [ ] **Step 4: Write only verified setup instructions**

Document Health Connect availability differences (Android 14+ built-in; Android 13/lower requires Health Connect install), permission management, iPhone Health access, pairing, data classes, conflict behavior, disconnect behavior and what data reaches a paired Gym&Me server. Mark unperformed device tests as unverified.

- [ ] **Step 5: Commit documentation and verification evidence**

```bash
git add docs/HEALTH.md docs/MOBILE.md docs/GYMANDME_LOCAL.md README.md
git commit -m "docs: explain Gym&Me health data sync"
```
