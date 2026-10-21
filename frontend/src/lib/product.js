export const PRODUCT_NAME = 'Gym&Me'
export const PRODUCT_ID = 'gymandme'
export const LEGACY_WEB_STATE_KEY = 'gym_state_v1'
export const WEB_STATE_KEY = 'gymandme_state_v1'
// A raw, malformed current web profile is retained here for explicit user recovery.  It is
// deliberately separate from the profile key and never parsed into profile state.
export const WEB_STATE_QUARANTINE_KEY = 'gymandme_state_quarantine_v1'
export const MIGRATION_JOURNAL_KEY = 'gym_legacy_migration_v1'
export const LEGACY_MOBILE_STATE_FILE = 'opengym-state.json'
export const MOBILE_STATE_FILE = 'gymandme-state.json'

// A compact provenance record for the one-way web-key migration.  The raw strings, rather than
// parsed profiles, make formatting-preserving legacy writes detectable without keeping a copy.
export function legacyRawFingerprint(raw) {
  let hash = 0x811c9dc5
  for (let i = 0; i < raw.length; i++) {
    hash ^= raw.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(36)
}

export function createMigrationJournal(legacyRaw, currentRaw = legacyRaw) {
  return { v: 1, legacy: legacyRawFingerprint(legacyRaw), current: legacyRawFingerprint(currentRaw) }
}

export function classifyLegacyMigration(legacyRaw, journalRaw) {
  if (typeof legacyRaw !== 'string') return { requiresLegacyLift: false }
  try {
    const journal = typeof journalRaw === 'string' ? JSON.parse(journalRaw) : journalRaw
    if (journal?.v !== 1 || typeof journal.legacy !== 'string' || typeof journal.current !== 'string') throw new Error('invalid journal')
    return { requiresLegacyLift: journal.legacy !== legacyRawFingerprint(legacyRaw) }
  } catch {
    // Missing or damaged provenance cannot prove whether a retained legacy copy is stale or a
    // rollback. Preserve the current key and let a later recovery flow make that decision.
    return { requiresLegacyLift: false, requiresRecovery: true }
  }
}

export function migrateLegacyWebState(storage) {
  const currentState = storage.getItem(WEB_STATE_KEY)
  // Presence means this installation has already moved to the current key. Even malformed data
  // is its durable state; never overwrite it from an older, potentially stale mirror.
  if (currentState !== null) return currentState

  const legacyState = storage.getItem(LEGACY_WEB_STATE_KEY)
  if (legacyState === null) return null

  JSON.parse(legacyState)
  try {
    storage.setItem(MIGRATION_JOURNAL_KEY, JSON.stringify(createMigrationJournal(legacyState)))
    storage.setItem(WEB_STATE_KEY, legacyState)
  } catch { /* valid legacy state remains usable */ }
  return legacyState
}

// A malformed present-day key is not permission to use the retained legacy mirror: it may be
// stale. Preserve the original and, where possible, take a byte-for-byte recovery copy before
// normal state handling can do anything else. The caller keeps the result in transient UI/store
// state so the raw payload is never included in a server profile.
export function quarantineCorruptWebState(storage) {
  let raw
  try { raw = storage.getItem(WEB_STATE_KEY) } catch { return null }
  if (raw === null) return null
  try { JSON.parse(raw); return null } catch {
    let quarantined = false
    try {
      storage.setItem(WEB_STATE_QUARANTINE_KEY, raw)
      quarantined = storage.getItem(WEB_STATE_QUARANTINE_KEY) === raw
    } catch { /* the untouched original remains the recovery source */ }
    return { kind: 'corrupt-current-web-state', key: WEB_STATE_KEY, raw, quarantineKey: WEB_STATE_QUARANTINE_KEY, quarantined }
  }
}
