# Gym&Me: zero-cost offline delivery

This is a delivery decision record for the Gym&Me workstream. It describes the
current source-backed options; it does **not** claim that a Gym&Me production
site, rebrand, native health bridge, or private HTTPS deployment has landed.

## Recommended free delivery paths

| Platform | Permanent free default | Local-data recommendation | Notes |
|---|---|---|---|
| Android | Capacitor local app | **Recommended for strongest local storage.** The mobile build mirrors state to the app-private `Directory.Data` file area, rather than relying only on WebView storage. | Build/install a local Capacitor app when durable on-device-only use is the priority. Export backups are still recommended. |
| iPhone | HTTPS PWA | **Permanent free default.** Open the HTTPS site in Safari, then use Add to Home Screen. | It has no seven-day signing cycle. Open it online once so its service-worker shell can be cached before relying on offline launch. |

## Important HTTPS boundary

> **HTTP IP Vite preview is dev-only, cannot register the production service worker because source requires HTTPS.**

The web entry point only registers `sw.js` when it is not the mobile build,
`serviceWorker` is available, and the page protocol is `https:`. An HTTP preview
address can help with development, but it is not a production offline-delivery
path.

## Current WSL test instance — not production

A working WSL test instance now exists at
`https://ax16pro-wsl-new.tail07c964.ts.net/`. It combines the Vite frontend
with the local Gym&Me API and has been opened by an Android user. The API is
configured for that exact WebAuthn hostname, and registration was locked to
invite-only after the first test profile was created.

This is deliberately **not** the final private deployment: it currently uses
Tailscale Funnel, which makes the URL public while enabled, and the Vite/API
processes are not reboot-persistent. The exact status, start commands, health
checks, data location, and shutdown procedure are in
[`GYMANDME_TEST_INSTANCE.md`](GYMANDME_TEST_INSTANCE.md). Do not treat this
fresh test instance as a migration path for an existing Gym&Me account.

## Optional iPhone native route

The iPhone native Xcode route using a free Apple ID/Personal Team is optional,
not the primary delivery. It is the route to consider for optional HealthKit
work, but no native HealthKit bridge is claimed to exist in the current source.
Free Personal Team signing requires the app to be re-installed/reprovisioned
after seven days. Prefer the HTTPS PWA for a permanent zero-cost iPhone
installation unless native-only capability is specifically needed.

## Normal offline limits and backup posture

- A PWA needs one online HTTPS opening/cache warm-up before an offline start.
- Exercise media is available offline only when it has already been cached.
- Keep export backups: they remain recommended even where the app maintains a
  local file mirror or service-worker cache.
- The Android Capacitor local path is device-local by default; do not treat an
  on-device copy as a substitute for an exported backup.

## Source-inspection evidence

The following are checked only by source inspection, not by a device trial:

- [x] **Verified by source inspection:** `frontend/src/main.jsx` has the
  HTTPS-only service-worker registration guard.
- [x] **Verified by source inspection:** `frontend/public/sw.js` writes the
  app shell with `c.put('index.html', ...)`.
- [x] **Verified by source inspection:** `frontend/src/lib/mobile.js` mirrors
  native state with `Filesystem.writeFile` in `Directory.Data`.
- [ ] **NOT YET VERIFIED:** real-device Android or iPhone offline behavior.
- [ ] **NOT YET VERIFIED:** a private Tailscale deployment and cross-device
  sync. The public Funnel test route above is verified, but it is not the
  private durable deployment.

## Naming and scope

Current source identifiers and existing documentation still use `Gym&Me` in
multiple places. This delivery note uses the requested Gym&Me workstream name
without asserting that a Gym&Me rebrand has landed.
