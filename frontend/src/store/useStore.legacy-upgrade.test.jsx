// @vitest-environment happy-dom

/* The update from v1.3.9 while that app still owed the server a change (QA retest 2026-10-06): its
   offline setting, plan and note changes were undone on the first sync when another device had
   synced meanwhile, and pushed without stamps when none had. lib/sync-legacy.js. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_WEB_STATE_KEY, migrateLegacyWebState } from '../lib/product.js'

const h = vi.hoisted(() => ({ api: null }))
vi.mock('../lib/api.js', () => ({ api: (...a) => h.api(...a), setRemoteAuth: () => {} }))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast: () => {}, stopRest: () => {}, abandonWork: () => {} }) } }))

const clone = v => JSON.parse(JSON.stringify(v))
const T = Date.UTC(2026, 9, 6, 8)
const W = (id, t) => ({ id, d: '2026-10-01', start: t, end: t + 3600e3, entries: [] })
const OWNER = 'u1'

// v1.3.9's fingerprint (lib/sync-changes.js at the v1.3.9 tag).
const NOT_CONTENT = new Set(['_ts', '_rev', 'active', 'workouts', 'bodyweight', 'routines', 'customEx'])
const hash = v => { const s = JSON.stringify(v) ?? ''; let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193) >>> 0 } return x.toString(36) }
function fp139(S) {
  const rest = {}
  for (const f of Object.keys(S).sort()) if (!NOT_CONTENT.has(f)) rest[f] = S[f]
  return { w: Object.fromEntries(S.workouts.map(w => [w.id, hash(w)])), b: {}, r: {}, c: {}, s: hash(rest) }
}

function server(doc) {
  const s = { doc: clone(doc), log: [] }
  h.api = async (path, opts = {}) => {
    const method = opts.method || 'GET'
    const body = opts.body ? JSON.parse(opts.body) : undefined
    s.log.push({ method, path, body })
    if (method === 'GET' && path === '/api/data/rev') return { rev: s.doc._rev }
    if (method === 'GET' && path === '/api/data') return { state: clone(s.doc), rev: s.doc._rev }
    if (method === 'PUT' && path === '/api/data') {
      if (body.baseRev != null && body.baseRev !== s.doc._rev) throw Object.assign(new Error('conflict'), { status: 409, data: { error: 'conflict', rev: s.doc._rev, state: clone(s.doc) } })
      body.state._rev = s.doc._rev + 1
      s.doc = body.state
      return { ok: true, rev: s.doc._rev }
    }
    throw new Error('unexpected ' + method + ' ' + path)
  }
  return s
}

let DEF
// What v1.3.9 left in the browser: its copy with offline changes, owed, the marker of the revision
// it last synced and the fingerprint of that copy. No write id: that app never wrote one.
function leaveOldCopy(base, mut) {
  const fp = fp139(base)
  const old = clone(base); delete old._rev
  mut(old)
  localStorage.setItem('gym_owner', OWNER)
  localStorage.setItem('gym_user', JSON.stringify({ id: OWNER, name: 'Ana' }))
  localStorage.setItem(LEGACY_WEB_STATE_KEY, JSON.stringify(old))
  localStorage.setItem('gym_sync', JSON.stringify({ rev: base._rev, ts: base._ts }))
  localStorage.setItem('gym_synced_fp', JSON.stringify(fp))
  localStorage.setItem('gym_dirty', '1')
}
async function openApp() {
  vi.resetModules()
  const m = await import('./useStore.js')
  m.useStore.setState({ user: { id: OWNER, name: 'Ana' }, ready: true })
  return m.useStore
}

beforeEach(async () => {
  localStorage.clear()
  DEF = (await import('./useStore.js')).DEF
})
afterEach(() => localStorage.clear())

const baseDoc = () => ({ ...clone(DEF), _ts: T, _rev: 3, restSec: 90, week: { 1: 'r1' }, exNotes: { bench: 'old' }, workouts: [W('w1', T - 9e6), W('w2', T - 8e6)] })

describe('the first sync after the update from v1.3.9', () => {
  it('another device synced meanwhile: the old app\'s offline rest time, plan day and note are kept', async () => {
    const base = baseDoc()
    leaveOldCopy(base, s => { s.restSec = 140; s.week = { 1: 'r1', 3: 'r1' }; s.exNotes = { bench: 'new note' }; s._ts = T + 1000 })
    // an updated device logged a workout and turned the sound off, stamped
    const srvDoc = { ...clone(base), _rev: 4, _ts: T + 5000, sound: false, edited: { sound: T + 5000 }, workouts: [...base.workouts, W('w3x', T + 5000)] }
    const srv = server(srvDoc)
    const A = await openApp()
    await A.getState().pullState()
    for (const S of [srv.doc, A.getState().S]) {
      expect(S.restSec).toBe(140)
      expect(S.week).toEqual({ 1: 'r1', 3: 'r1' })
      expect(S.exNotes.bench).toBe('new note')
      expect(S.sound).toBe(false)
      expect(S.workouts.map(w => w.id).sort()).toEqual(['w1', 'w2', 'w3x'])
    }
    expect(localStorage.getItem('gym_legacy_owed')).toBe(null)
    expect(localStorage.getItem('gym_stash')).toBe(null)
  })

  it('keeps a dirty legacy copy classified when neither new state nor marker can be written', async () => {
    const base = baseDoc()
    leaveOldCopy(base, s => { s.restSec = 140; s.week = { 1: 'r1', 3: 'r1' }; s.exNotes = { bench: 'offline note' }; s._ts = T + 1000 })
    const srv = server(base)
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const storage = globalThis.localStorage
    const refusingStorage = new Proxy(storage, {
      get(target, prop) {
        const value = Reflect.get(target, prop)
        if (prop === 'setItem') return (key, value) => {
          if (key === 'gymandme_state_v1' || key === 'gym_legacy_owed') throw new DOMException('quota', 'QuotaExceededError')
          return storage.setItem(key, value)
        }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    Object.defineProperty(globalThis, 'localStorage', { value: refusingStorage, configurable: true })
    try {
      const A = await openApp()
      await A.getState().pullState()

      expect(localStorage.getItem('gym_legacy_owed')).toBeNull()
      expect(srv.log.find(x => x.method === 'PUT').body.stamped).toBe(false)
      expect(srv.doc.restSec).toBe(140)
      expect(srv.doc.week).toEqual({ 1: 'r1', 3: 'r1' })
      expect(srv.doc.exNotes.bench).toBe('offline note')
    } finally {
      Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })

  it('both sides changed the same setting: the merge decides as before, and the old copy is kept aside', async () => {
    const base = baseDoc()
    leaveOldCopy(base, s => { s.restSec = 140; s._ts = T + 1000 })
    server({ ...clone(base), _rev: 4, _ts: T + 5000, restSec: 60, edited: { restSec: T + 5000 } })
    const A = await openApp()
    await A.getState().pullState()
    await new Promise(r => setTimeout(r, 20))
    const kept = Object.values(JSON.parse(localStorage.getItem('gym_stash')) || {})
    expect(kept).toHaveLength(1)
    expect(kept[0].name).toBe('This device, before the update')
    expect(kept[0].state.restSec).toBe(140)
  })

  it('nobody synced meanwhile: the push lets the server stamp what the old app changed', async () => {
    const base = baseDoc()
    leaveOldCopy(base, s => { s.restSec = 140; s._ts = T + 1000 })
    const srv = server(base)
    const A = await openApp()
    await A.getState().pullState()
    const put = srv.log.find(x => x.method === 'PUT')
    expect(put.body.stamped).toBe(false)
    expect(put.body.baseRev).toBe(3)
    expect(localStorage.getItem('gym_legacy_owed')).toBe(null)
    // and from here on this app stamps its own changes
    A.getState().update(s => { s.restSec = 150 })
    await A.getState().pushState()
    expect(srv.log.filter(x => x.method === 'PUT').at(-1).body.stamped).toBe(true)
  })

  it('retries a legacy-marker removal that failed after reconciliation before a restarted copy syncs', async () => {
    const base = baseDoc()
    leaveOldCopy(base, s => { s.restSec = 140; s._ts = T + 1000 })
    const srv = server({ ...clone(base), _rev: 4, _ts: T + 5000, sound: false, edited: { sound: T + 5000 }, workouts: [...base.workouts, W('w3x', T + 5000)] })
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const storage = globalThis.localStorage
    const refusingRemoval = new Proxy(storage, {
      get(target, prop) {
        const value = Reflect.get(target, prop)
        if (prop === 'removeItem') return key => {
          if (key === 'gym_legacy_owed') throw new DOMException('quota', 'QuotaExceededError')
          return storage.removeItem(key)
        }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    Object.defineProperty(globalThis, 'localStorage', { value: refusingRemoval, configurable: true })
    try {
      const A = await openApp()
      await A.getState().pullState()
      expect(srv.log.find(x => x.method === 'PUT').body.stamped).toBe(true)
      expect(localStorage.getItem('gym_legacy_owed')).not.toBeNull()
    } finally {
      Object.defineProperty(globalThis, 'localStorage', descriptor)
    }

    const B = await openApp()
    B.getState().update(s => { s.restSec = 150 })
    await B.getState().pushState()

    expect(srv.log.filter(x => x.method === 'PUT').at(-1).body.stamped).toBe(true)
    expect(localStorage.getItem('gym_legacy_owed')).toBeNull()
  })

  it('a copy this app wrote is never taken for an old app\'s', async () => {
    const base = baseDoc()
    leaveOldCopy(base, s => { s.restSec = 140 })
    localStorage.setItem('gym_state_wid', 'abc')
    const srv = server(base)
    const A = await openApp()
    await A.getState().pullState()
    expect(srv.log.find(x => x.method === 'PUT').body.stamped).toBe(true)
  })

  it('lifts a dirty legacy rollback changed after migration even when an old WID exists', async () => {
    const base = baseDoc()
    const retained = clone(base); delete retained._rev
    localStorage.setItem('gym_owner', OWNER)
    localStorage.setItem('gym_user', JSON.stringify({ id: OWNER, name: 'Ana' }))
    localStorage.setItem(LEGACY_WEB_STATE_KEY, JSON.stringify(retained))
    localStorage.setItem('gym_sync', JSON.stringify({ rev: base._rev, ts: base._ts }))
    localStorage.setItem('gym_synced_fp', JSON.stringify(fp139(base)))
    localStorage.setItem('gym_dirty', '1')
    migrateLegacyWebState(localStorage)
    localStorage.setItem(LEGACY_WEB_STATE_KEY, JSON.stringify({
      ...retained,
      restSec: 140,
      week: { 1: 'r1', 3: 'r1' },
      exNotes: { bench: 'rollback note' },
      _ts: T + 1000,
    }))
    localStorage.setItem('gym_state_wid', 'old-wid')
    const srv = server(base)

    const A = await openApp()
    await A.getState().pullState()

    expect(srv.log.find(x => x.method === 'PUT').body.stamped).toBe(false)
    for (const S of [srv.doc, A.getState().S]) {
      expect(S.restSec).toBe(140)
      expect(S.week).toEqual({ 1: 'r1', 3: 'r1' })
      expect(S.exNotes.bench).toBe('rollback note')
    }
  })

  it.each([null, '{not valid json'])('keeps the current dirty state when retained legacy provenance is unknown (%s)', async journal => {
    const base = baseDoc()
    const retained = clone(base); delete retained._rev
    const current = { ...clone(base), restSec: 140, _ts: T + 1000 }
    localStorage.setItem('gym_owner', OWNER)
    localStorage.setItem('gym_user', JSON.stringify({ id: OWNER, name: 'Ana' }))
    localStorage.setItem('gymandme_state_v1', JSON.stringify(current))
    localStorage.setItem(LEGACY_WEB_STATE_KEY, JSON.stringify(retained))
    if (journal !== null) localStorage.setItem('gym_legacy_migration_v1', journal)
    localStorage.setItem('gym_sync', JSON.stringify({ rev: base._rev, ts: base._ts }))
    localStorage.setItem('gym_synced_fp', JSON.stringify(fp139(base)))
    localStorage.setItem('gym_dirty', '1')
    localStorage.setItem('gym_state_wid', 'old-wid')
    const srv = server(base)

    const A = await openApp()
    await A.getState().pullState()

    expect(A.getState().S.restSec).toBe(140)
    expect(srv.log.find(x => x.method === 'PUT').body.stamped).toBe(true)
    expect(localStorage.getItem('gym_legacy_owed')).toBeNull()
  })
})
