# Gym&Me Product and Health Integration Design

## Decision

The derivative product is named **Gym&Me**. Its machine-safe identifier is `gymandme`, its local repository directory is `gym-and-me`, and the proposed native application identifiers are:

- Android release: `com.gymandme.app`
- Android debug: `com.gymandme.app.test`
- iOS: `com.gymandme.app`

These identifiers must be checked against the eventual Google Play and Apple developer accounts before a public release. No remote repository, app-store account, or domain is created by this work.

## Product identity and licence boundaries

Gym&Me is an AGPL-3.0-or-later derivative of openGym. All user-facing product identity will change to Gym&Me: the web UI, PWA metadata, native labels and identifiers, backups, runtime configuration examples, website, documentation, release/update copy, icons and splash assets.

The original copyright, AGPL licence text, NOTICE, third-party attribution, historical changelog content, and upstream source references remain where legally required. In particular, Gym Visual exercise imagery is not relicensed by the upstream project and must not be represented as commercially reusable without a separate licence.

The current clone remains local. Before publishing, the original remote becomes `upstream` and a user-owned Gym&Me repository becomes `origin`; this is deliberately outside the current scope.

## Runtime and device model

Gym&Me retains the existing self-hosted architecture: React/Vite frontend, Node API, nginx web container and a user-owned data directory. Browser/PWA users sign in over HTTPS with passkeys. Native Capacitor users pair from a signed-in browser with a one-time code and use a bearer token; edits survive offline and merge through the existing per-field synchronization model.

A real device must use a reachable HTTPS server for pairing. `localhost` is valid only for host-local development, not a phone. The project is installable as a PWA on iPhone and Android; native Android builds are APKs, while native iPhone builds require Xcode and an Apple signing identity.

## Health feature: version-one scope

Gym&Me will connect to Android Health Connect and Apple HealthKit in the native Capacitor app only. The first version handles only:

1. Body mass / body weight.
2. Completed workout sessions.

It reads those records into Gym&Me and exports Gym&Me manual weigh-ins and completed workouts. It does not request steps, active calories, heart-rate streams, sleep, GPS routes, reproductive data, medical records, or background read permission in version one.

Health permissions are explicit and per platform. The Settings page gives a user a clear connection status, explanation of the two requested record types, connect/disconnect controls, a manual sync command, last-sync status, and native “manage access” access. A denied, revoked, unavailable, or unsupported platform is shown as such and never blocks normal workout logging.

## Data ownership, privacy and conflict rules

A health connection is local to a physical phone. The connection state, native record cursor and exported-record mapping stay in the app’s private native storage and are never synced or exported with the Gym&Me profile.

Imported health records become ordinary Gym&Me body-weight/workout entries only after the user approves the import disclosure. In paired mode, those resulting entries use the existing Gym&Me sync and therefore reach the user’s own server and other paired devices; the app makes that visible before the first import. In local-only mode, they remain only in the app’s local Gym&Me store.

The native metadata map prevents re-importing records Gym&Me wrote itself. The rules are:

- A Health Connect/HealthKit record written by Gym&Me is tagged with an app-owned external identifier and excluded on later reads.
- An imported health workout retains its stable external source identifier so a later scan updates/skips it instead of duplicating it.
- A health weight on a day with a manually entered Gym&Me weigh-in is not allowed to overwrite the manual value; it is reported as a skipped conflict.
- When several external weights exist for an otherwise empty day, the latest measurement wins.
- Imported workouts have no invented sets, reps, exercise load, calories or heart rate. They are labeled as imported sessions and preserve only source, start/end time and activity classification available from the native store.
- Sync runs only on user action and native-app foreground in v1; no background health-read permission is requested.

## Native architecture

A small shared JavaScript module defines the platform-neutral bridge DTOs and reconciliation logic. It is guarded by the existing `MOBILE` flag so browser/PWA builds do not load native APIs.

Android uses a local Capacitor Java plugin plus `androidx.health.connect:connect-client`. It checks availability on every operation, supports Android 14+ framework Health Connect and the installed Health Connect application on supported older Android versions, requests only weight and exercise permissions, and declares the required rationale activity/permission usage route.

iOS uses a local Capacitor Swift plugin backed by `HKHealthStore`. It requests body-mass and workout authorization only, adds the HealthKit entitlement and usage strings, and exposes the same bridge DTOs as Android.

The Settings UI and reconciler depend only on the JavaScript contract. Native source code remains platform-specific; the server API does not receive HealthKit/Health Connect credentials or raw platform account information.

## Verification requirements

- Rebrand: automated token inventory, frontend/API/MCP tests, production web build, local stack health check, browser verification, and native configuration inspection.
- Sync: browser-to-phone pairing on a reachable HTTPS instance, an offline change followed by reconciliation, and a two-device read-back.
- Health: mocked JavaScript contract/unit tests; Android and iOS source/configuration checks in CI; manual physical-device test matrix covering availability, grant, denial, revocation, import, export, duplicate prevention and manual-weight conflicts.

## Known environment constraints

This WSL host has Node/npm, but no Docker daemon/CLI, Java, Android SDK/ADB or Gradle. A local server and Android APK cannot be verified until those prerequisites are installed. iOS compilation and HealthKit verification require a Mac with Xcode.
