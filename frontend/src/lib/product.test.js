import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  LEGACY_MOBILE_STATE_FILE,
  LEGACY_WEB_STATE_KEY,
  classifyLegacyMigration,
  createMigrationJournal,
  legacyRawFingerprint,
  MIGRATION_JOURNAL_KEY,
  MOBILE_STATE_FILE,
  migrateLegacyWebState,
  PRODUCT_ID,
  PRODUCT_NAME,
  WEB_STATE_KEY,
} from './product'

function bootstrapDocument(entries, language = 'en-GB') {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
  const [, script] = html.match(/<script>([\s\S]*?)<\/script>/) || []
  const document = { documentElement: {} }
  new Function('localStorage', 'navigator', 'document', script)({ getItem: key => entries[key] ?? null }, { language }, document)
  return document.documentElement
}

function createStorage(entries = {}, refuseSetItem = () => false) {
  const values = new Map(Object.entries(entries))
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null },
    setItem(key, value) {
      if (refuseSetItem(key, value)) throw new DOMException('quota', 'QuotaExceededError')
      values.set(key, value)
    },
  }
}

describe('Gym&Me product identity', () => {
  it('exports the exact identity and persistence constants', () => {
    expect(PRODUCT_NAME).toBe('Gym&Me')
    expect(PRODUCT_ID).toBe('gymandme')
    expect(LEGACY_WEB_STATE_KEY).toBe('gym_state_v1')
    expect(WEB_STATE_KEY).toBe('gymandme_state_v1')
    expect(LEGACY_MOBILE_STATE_FILE).toBe('opengym-state.json')
    expect(MOBILE_STATE_FILE).toBe('gymandme-state.json')
  })

  it('copies valid legacy web state while preserving its source entry', () => {
    const legacyState = JSON.stringify({ sessions: [{ id: 'session-1' }] })
    const storage = createStorage({ [LEGACY_WEB_STATE_KEY]: legacyState })

    expect(migrateLegacyWebState(storage)).toBe(legacyState)
    expect(storage.getItem(WEB_STATE_KEY)).toBe(legacyState)
    expect(storage.getItem(LEGACY_WEB_STATE_KEY)).toBe(legacyState)
  })

  it('does not create current state when recording first-migration provenance fails', () => {
    const legacyState = JSON.stringify({ sessions: [{ id: 'session-1' }] })
    const storage = createStorage(
      { [LEGACY_WEB_STATE_KEY]: legacyState },
      key => key === MIGRATION_JOURNAL_KEY,
    )

    expect(migrateLegacyWebState(storage)).toBe(legacyState)
    expect(storage.getItem(WEB_STATE_KEY)).toBeNull()
    expect(storage.getItem(LEGACY_WEB_STATE_KEY)).toBe(legacyState)
  })

  it('retains an existing new web state instead of replacing it from legacy', () => {
    const currentState = JSON.stringify({ sessions: [{ id: 'current' }] })
    const legacyState = JSON.stringify({ sessions: [{ id: 'legacy' }] })
    const storage = createStorage({
      [WEB_STATE_KEY]: currentState,
      [LEGACY_WEB_STATE_KEY]: legacyState,
    })

    expect(migrateLegacyWebState(storage)).toBe(currentState)
    expect(storage.getItem(WEB_STATE_KEY)).toBe(currentState)
  })

  it('preserves malformed current web state instead of restoring stale legacy state', () => {
    const legacyState = JSON.stringify({ sessions: [{ id: 'legacy' }] })
    const storage = createStorage({
      [WEB_STATE_KEY]: '{not valid json',
      [LEGACY_WEB_STATE_KEY]: legacyState,
    })

    expect(migrateLegacyWebState(storage)).toBe('{not valid json')
    expect(storage.getItem(WEB_STATE_KEY)).toBe('{not valid json')
    expect(storage.getItem(LEGACY_WEB_STATE_KEY)).toBe(legacyState)
  })

  it('uses legacy state only when the current web key is absent', () => {
    expect(bootstrapDocument({
      [WEB_STATE_KEY]: JSON.stringify({ lang: 'ar' }),
      [LEGACY_WEB_STATE_KEY]: JSON.stringify({ lang: 'en' }),
    })).toEqual({ lang: 'ar', dir: 'rtl' })

    expect(bootstrapDocument({
      [WEB_STATE_KEY]: '{not valid json',
      [LEGACY_WEB_STATE_KEY]: JSON.stringify({ lang: 'ar' }),
    })).toEqual({ lang: 'en', dir: 'ltr' })
  })

  it('returns null when neither current nor legacy web state exists', () => {
    const storage = createStorage()

    expect(migrateLegacyWebState(storage)).toBeNull()
  })

  it('throws for malformed legacy state without creating new web state', () => {
    const storage = createStorage({ [LEGACY_WEB_STATE_KEY]: '{not valid json' })

    expect(() => migrateLegacyWebState(storage)).toThrow(SyntaxError)
    expect(storage.getItem(WEB_STATE_KEY)).toBeNull()
  })

  it('makes a stable fingerprint for the same legacy raw JSON and a different one when it changes', () => {
    const raw = JSON.stringify({ sessions: [{ id: 'session-1' }] })

    expect(legacyRawFingerprint(raw)).toBe(legacyRawFingerprint(raw))
    expect(legacyRawFingerprint(raw)).not.toBe(legacyRawFingerprint(JSON.stringify({ sessions: [{ id: 'session-2' }] })))
  })

  it('recognizes retained legacy raw state recorded by its migration journal', () => {
    const raw = JSON.stringify({ sessions: [{ id: 'session-1' }] })

    expect(classifyLegacyMigration(raw, JSON.stringify(createMigrationJournal(raw)))).toEqual({ requiresLegacyLift: false })
  })

  it('requires a legacy lift when retained legacy raw state changed after migration', () => {
    const original = JSON.stringify({ sessions: [{ id: 'session-1' }] })
    const changed = JSON.stringify({ sessions: [{ id: 'session-2' }] })

    expect(classifyLegacyMigration(changed, JSON.stringify(createMigrationJournal(original)))).toEqual({ requiresLegacyLift: true })
  })

  it('requires manual recovery rather than lifting legacy for missing or malformed journals', () => {
    const raw = JSON.stringify({ sessions: [{ id: 'session-1' }] })

    expect(classifyLegacyMigration(raw, null)).toEqual({ requiresLegacyLift: false, requiresRecovery: true })
    expect(classifyLegacyMigration(raw, '{not valid json')).toEqual({ requiresLegacyLift: false, requiresRecovery: true })
  })
})
