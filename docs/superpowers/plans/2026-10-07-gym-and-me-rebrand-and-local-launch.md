# Gym&Me Rebrand and Local Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the openGym derivative into Gym&Me without breaking existing profile data, browser sync, native pairing, or licence obligations, then run and verify the local application.

**Architecture:** Product names are separated from historical/legal attribution. Runtime identifiers migrate from `opengym` to `gymandme` with one-time legacy local-storage/file compatibility; server state and sync protocol remain otherwise unchanged. The browser/PWA and Capacitor targets consume the same frontend build.

**Tech Stack:** React 19, Vite 8, Zustand, Capacitor 7, Android Gradle, Xcode project, Node 22, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-10-07-gym-and-me-design.md`

## Global Constraints

- Display brand is exactly `Gym&Me`; machine-safe identifier is exactly `gymandme`.
- Proposed Android/iOS release identifier is exactly `com.gymandme.app`; Android debug suffix is exactly `.test`.
- Do not alter `LICENSE`, original copyright attribution, `NOTICE.md` third-party media warnings, or historical changelog claims.
- Preserve existing `gym_state_v1` users through a one-time migration; do not discard local user data.
- Preserve browser/passkey and native pairing behavior; a phone requires a reachable HTTPS origin.
- Do not create, publish, push, or configure a remote Gym&Me repository in this plan.
- Do not add Health Connect or HealthKit in this plan; that is the companion health-bridges plan.

---

### Task 1: Add a tested product-identity module and legacy-state migration

**Files:**
- Create: `frontend/src/lib/product.js`
- Create: `frontend/src/lib/product.test.js`
- Modify: `frontend/src/store/useStore.js: storage key/bootstrap persistence code`
- Modify: `frontend/src/lib/mobile.js: 35-87`

**Interfaces:**
- Produces: `PRODUCT_NAME`, `PRODUCT_ID`, `LEGACY_WEB_STATE_KEY`, `WEB_STATE_KEY`, `MOBILE_STATE_FILE`, `LEGACY_MOBILE_STATE_FILE`.
- Produces: `readLegacyWebState(storage)` and `migrateLegacyWebState(storage)` returning a parsed state or `null` without deleting a valid source before a new write succeeds.
- Consumes: existing Zustand boot/persist flow and Capacitor Filesystem helpers.

- [ ] **Step 1: Write the failing web-state migration tests**

```js
import { describe, expect, it } from 'vitest'
import { LEGACY_WEB_STATE_KEY, WEB_STATE_KEY, migrateLegacyWebState } from './product.js'

it('copies the legacy profile to the Gym&Me key once and preserves the source until the copy exists', () => {
  const data = JSON.stringify({ unit: 'kg', bodyweight: [{ d: '2026-10-07', w: 80 }] })
  const storage = new Map([[LEGACY_WEB_STATE_KEY, data]])
  storage.getItem = storage.get.bind(storage)
  storage.setItem = storage.set.bind(storage)
  migrateLegacyWebState(storage)
  expect(storage.getItem(WEB_STATE_KEY)).toBe(data)
  expect(storage.getItem(LEGACY_WEB_STATE_KEY)).toBe(data)
})
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `cd frontend && npx vitest run src/lib/product.test.js`

Expected: FAIL because `product.js` does not exist.

- [ ] **Step 3: Implement the minimal identity/migration module**

```js
export const PRODUCT_NAME = 'Gym&Me'
export const PRODUCT_ID = 'gymandme'
export const LEGACY_WEB_STATE_KEY = 'gym_state_v1'
export const WEB_STATE_KEY = 'gymandme_state_v1'
export const LEGACY_MOBILE_STATE_FILE = 'opengym-state.json'
export const MOBILE_STATE_FILE = 'gymandme-state.json'

export function migrateLegacyWebState(storage) {
  if (storage.getItem(WEB_STATE_KEY)) return storage.getItem(WEB_STATE_KEY)
  const legacy = storage.getItem(LEGACY_WEB_STATE_KEY)
  if (!legacy) return null
  JSON.parse(legacy)
  storage.setItem(WEB_STATE_KEY, legacy)
  return legacy
}
```

Call migration before the existing store reads its persisted state. Make `nativeLoad()` read the Gym&Me mobile file first, then the legacy file, and have the next successful `nativeSave()` use only the Gym&Me file.

- [ ] **Step 4: Run focused tests**

Run: `cd frontend && npx vitest run src/lib/product.test.js src/store/useStore.restore.test.jsx --no-file-parallelism --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit the self-contained migration**

```bash
git add frontend/src/lib/product.js frontend/src/lib/product.test.js frontend/src/store/useStore.js frontend/src/lib/mobile.js
git commit -m "feat: migrate local profiles to Gym&Me identity"
```

### Task 2: Rebrand the runtime web/PWA identity and visible in-app copy

**Files:**
- Modify: `frontend/capacitor.config.json`
- Modify: `frontend/index.html`
- Modify: `frontend/public/manifest.webmanifest`
- Modify: `frontend/src/lib/demo.js`
- Modify: `frontend/src/lib/update.js`
- Modify: `frontend/src/views/Settings.jsx`
- Modify: `frontend/src/lib/i18n-core.js` and every locale file containing product-name copy
- Test: `frontend/src/lib/product.test.js`

**Interfaces:**
- Consumes: `PRODUCT_NAME` and `PRODUCT_ID` from `lib/product.js`.
- Produces: PWA title/application name `Gym&Me`, Capacitor `appName: "Gym&Me"`, and no runtime release endpoint pointing at the original project.

- [ ] **Step 1: Write a failing static identity test**

```js
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('ships Gym&Me in web and Capacitor metadata', () => {
  expect(readFileSync(new URL('../../capacitor.config.json', import.meta.url), 'utf8')).toContain('"appName": "Gym&Me"')
  expect(readFileSync(new URL('../../index.html', import.meta.url), 'utf8')).toMatch(/Gym&Me/)
})
```

- [ ] **Step 2: Run the test and verify failure**

Run: `cd frontend && npx vitest run src/lib/product.test.js`

Expected: FAIL because current metadata still says openGym.

- [ ] **Step 3: Apply the safe identity mapping**

Use this mapping only in live product copy and runtime metadata:

```text
openGym       -> Gym&Me
OpenGym       -> Gym&Me
opengym       -> gymandme
ch.duartesantos.opengym -> com.gymandme.app
```

Change release/update links to a neutral disabled state until a Gym&Me release repository is configured: the app must not claim a Gym&Me update is available from the upstream project. Keep legacy migration identifiers intact only in `product.js`.

- [ ] **Step 4: Run focused metadata/localisation tests and production build**

Run: `cd frontend && npx vitest run src/lib/product.test.js src/views/Settings.update.test.jsx --no-file-parallelism --maxWorkers=1 && npm run build`

Expected: PASS and a successful Vite build.

- [ ] **Step 5: Commit the runtime rebrand**

```bash
git add frontend
git commit -m "feat: rebrand web and mobile runtime as Gym&Me"
```

### Task 3: Rebrand Android and iOS application identity without breaking native sources

**Files:**
- Modify: `frontend/android/app/build.gradle:4-11,31-36`
- Modify: `frontend/android/app/src/main/AndroidManifest.xml`
- Move: `frontend/android/app/src/main/java/ch/duartesantos/opengym/` to `frontend/android/app/src/main/java/com/gymandme/app/`
- Modify: all moved Android Java `package` declarations and `opengym:` event names
- Modify: `frontend/ios/App/App/Info.plist:7-16,65-68`
- Modify: `frontend/ios/App/App.xcodeproj/project.pbxproj:357-394`
- Modify: `frontend/ios/App/App/PrintPlugin.swift:16-25`
- Modify: `frontend/resources/icon.svg`
- Test: `frontend/src/lib/product.test.js`

**Interfaces:**
- Produces: release package/bundle ID `com.gymandme.app`, Android debug ID `com.gymandme.app.test`, and native labels `Gym&Me`.
- Consumes: `capacitor.config.json` app ID/name and existing Android Java package structure.

- [ ] **Step 1: Extend the static identity test before editing native files**

```js
it('uses the Gym&Me native package identifiers', () => {
  const gradle = readFileSync(new URL('../../android/app/build.gradle', import.meta.url), 'utf8')
  expect(gradle).toContain('applicationId "com.gymandme.app"')
  const project = readFileSync(new URL('../../ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8')
  expect(project).toContain('PRODUCT_BUNDLE_IDENTIFIER = com.gymandme.app;')
})
```

- [ ] **Step 2: Run test and verify failure**

Run: `cd frontend && npx vitest run src/lib/product.test.js`

Expected: FAIL on upstream package identifiers.

- [ ] **Step 3: Update native identity and regenerate native assets**

Use `com.gymandme.app` consistently in Android Gradle namespace/application ID, Java directory/package declarations, Android authority interpolation, iOS project identifiers and Capacitor config. Change only application labels and product names in iOS `Info.plist`; retain unrelated capability strings.

Generate platform icons from the new `resources/icon.svg`:

```bash
cd frontend
npx @capacitor/assets generate --iconBackgroundColor '#0c0e12' --splashBackgroundColor '#0c0e12'
```

- [ ] **Step 4: Run static test/build verification**

Run: `cd frontend && npx vitest run src/lib/product.test.js && npm run build && npm run build:mobile`

Expected: all commands succeed once Java/Android SDK are present. If unavailable, record the environment block; do not claim APK verification.

- [ ] **Step 5: Commit native identity**

```bash
git add frontend/android frontend/ios frontend/resources frontend/capacitor.config.json frontend/src/lib/product.test.js
git commit -m "feat: give native builds the Gym&Me identity"
```

### Task 4: Rebrand server/deployment metadata and operator documentation

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `README.md`
- Modify: `docs/README.md`, `docs/SELF_HOSTING.md`, `docs/MOBILE.md`, `docs/FAQ.md`, `docs/DATA_IMPORTS.md`, `docs/AI_COACH.md`
- Modify: `website/` product pages and metadata
- Modify: `kubernetes/` manifest names/labels/examples
- Modify: `CONTRIBUTING.md`, `SECURITY.md`, `mcp/README.md`, `mcp/package.json`, `api/package.json`, `frontend/package.json`
- Preserve: `LICENSE`, `NOTICE.md`, historical portions of `CHANGELOG.md`, upstream URLs needed as historical/legal attribution
- Test: repository token inventory command

**Interfaces:**
- Produces: operational configuration that advertises `RP_NAME=Gym&Me` and Gym&Me deployment examples.
- Consumes: existing variable names (`RP_ID`, `ORIGIN`, `WEB_PORT`) unchanged, because deployment compatibility depends on them.

- [ ] **Step 1: Add a rebrand inventory script test**

Create `scripts/check-brand.sh` that fails only for live product references, while allowing a documented set of legal/historical files:

```sh
#!/usr/bin/env sh
set -eu
bad=$(git grep -I -n -E 'openGym|opengym|OpenGym' -- \
  ':!LICENSE' ':!NOTICE.md' ':!CHANGELOG.md' ':!docs/superpowers/**' || true)
[ -z "$bad" ] || { printf '%s\n' "$bad"; exit 1; }
```

- [ ] **Step 2: Run the inventory and verify it fails before replacement**

Run: `./scripts/check-brand.sh`

Expected: non-zero, listing live product references.

- [ ] **Step 3: Update deployment/docs copy with factual replacement URLs only**

Use `Gym&Me` in titles/copy and `gymandme` in non-legal file paths/names. Do not invent a public website, app-store URL, container registry or release URL. Replace original automatic-update/download links with local-build instructions until the new publishing destination exists.

- [ ] **Step 4: Verify the inventory, tests and builds**

Run:

```bash
./scripts/check-brand.sh
cd frontend && npm test -- --no-file-parallelism --maxWorkers=1
cd ../api && npm test
cd ../mcp && npm test
```

Expected: inventory succeeds; test suites pass.

- [ ] **Step 5: Commit docs/deployment rebrand**

```bash
git add .env.example docker-compose.yml README.md docs website kubernetes CONTRIBUTING.md SECURITY.md mcp api frontend scripts/check-brand.sh
git commit -m "docs: complete Gym&Me operator rebrand"
```

### Task 5: Provision prerequisites, boot locally, and verify browser/PWA behavior

**Files:**
- Create: `docs/GYMANDME_LOCAL.md`
- Modify: `README.md: local quick-start section`
- Test: live HTTP/PWA browser verification

**Interfaces:**
- Consumes: Docker Compose configuration, `.env` derived from `.env.example`, and `WEB_PORT`.
- Produces: a locally verified `http://localhost:8080` Gym&Me instance and exact phone pairing prerequisites.

- [ ] **Step 1: Check prerequisites without installing silently**

Run:

```bash
docker --version
docker compose version
java -version
sdkmanager --version
adb version
```

Expected: report each missing command. Obtain user approval before system-level installation.

- [ ] **Step 2: Start the stack from the rebranded source**

```bash
cp .env.example .env
# Set only RP_NAME=Gym&Me for localhost development; retain localhost RP_ID/ORIGIN.
docker compose up -d --build
curl --fail --show-error http://localhost:8080/api/health
```

Expected: healthy API response and the `web`/`api` containers running.

- [ ] **Step 3: Verify the running UI through the browser**

Open `http://localhost:8080`, confirm the document/app title is Gym&Me, create a local test profile, refresh, and export/import a test backup. Do not use production personal data for this test.

- [ ] **Step 4: Write the verified device instructions**

Document two paths:

```text
PWA: deploy with HTTPS -> create/sign into profile in browser -> Add to Home Screen -> use the same HTTPS hostname on every device.
Native: build mobile bundle -> install Android APK or Xcode iPhone build -> signed-in browser Settings > Account > Pair the mobile app -> enter one-time code on phone -> make an offline change -> reconnect -> verify it reaches browser.
```

State that `localhost` cannot pair a physical phone and that iOS native verification requires macOS/Xcode.

- [ ] **Step 5: Commit launch documentation**

```bash
git add docs/GYMANDME_LOCAL.md README.md
git commit -m "docs: add verified Gym&Me local and phone setup"
```
