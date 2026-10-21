// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEGACY_WEB_STATE_KEY, WEB_STATE_KEY, WEB_STATE_QUARANTINE_KEY } from '../lib/product.js'

const h = vi.hoisted(() => ({ api: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: (...args) => h.api(...args), setRemoteAuth: () => {} }))
vi.mock('./useUI.js', () => ({ useUI: { getState: () => ({ toast: () => {}, stopRest: () => {}, abandonWork: () => {} }) } }))

async function openApp() {
  vi.resetModules()
  return (await import('./useStore.js')).useStore
}

beforeEach(() => {
  localStorage.clear()
  h.api.mockReset()
  h.api.mockResolvedValue({ ok: true, rev: 1 })
})

afterEach(() => localStorage.clear())

describe('corrupt current web-state recovery', () => {
  it('records corrupt current state at boot without putting its raw payload in the profile', async () => {
    const raw = '{broken current state'
    localStorage.setItem(WEB_STATE_KEY, raw)
    localStorage.setItem(LEGACY_WEB_STATE_KEY, JSON.stringify({ restSec: 77 }))

    const store = await openApp()
    const state = store.getState()

    expect(state.webRecovery).toMatchObject({ kind: 'corrupt-current-web-state', raw, key: WEB_STATE_KEY })
    expect(state.getWebRecoveryRaw()).toBe(raw)
    expect(state.S).not.toHaveProperty('webRecovery')
    expect(JSON.stringify(state.S)).not.toContain(raw)
  })

  it('does not overwrite corrupt current state or push while recovery is active', async () => {
    const raw = '{broken current state'
    localStorage.setItem(WEB_STATE_KEY, raw)
    localStorage.setItem('gym_user', JSON.stringify({ id: 'u1', name: 'Ana' }))
    const store = await openApp()
    store.setState({ ready: true })

    store.getState().update(S => { S.restSec = 120 })
    await store.getState().pushState()

    expect(localStorage.getItem(WEB_STATE_KEY)).toBe(raw)
    expect(h.api).not.toHaveBeenCalled()
  })

  it('keeps corrupt current state through clearLocalSession via sign-out', async () => {
    const raw = '{broken current state'
    localStorage.setItem(WEB_STATE_KEY, raw)
    localStorage.setItem('gym_user', JSON.stringify({ id: 'u1', name: 'Ana' }))
    const store = await openApp()

    await store.getState().signOut()

    expect(store.getState().getWebRecoveryRaw()).toBe(raw)
    expect(localStorage.getItem(WEB_STATE_KEY)).toBe(raw)
  })

  it('keeps corrupt current state through an account switch', async () => {
    const raw = '{broken current state'
    localStorage.setItem(WEB_STATE_KEY, raw)
    localStorage.setItem('gym_owner', 'previous-user')
    const store = await openApp()

    store.getState().setUser({ id: 'next-user', name: 'Nia' })

    expect(store.getState().getWebRecoveryRaw()).toBe(raw)
    expect(localStorage.getItem(WEB_STATE_KEY)).toBe(raw)
  })

  it('keeps corrupt current state when keepForPrevious makes room for its stash', async () => {
    const raw = '{broken current state'
    localStorage.setItem(WEB_STATE_KEY, raw)
    localStorage.setItem('gym_owner', 'previous-user')
    const store = await openApp()
    store.setState({ S: { ...store.getState().S, routines: [{ id: 'local-routine', ex: [] }] } })

    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const storage = globalThis.localStorage
    let stashWrites = 0
    const removed = []
    const storageFullForStash = new Proxy(storage, {
      get(target, prop) {
        const value = Reflect.get(target, prop)
        if (prop === 'setItem') return (key, value) => {
          if (key === 'gym_stash' && stashWrites++ === 0) throw new DOMException('quota', 'QuotaExceededError')
          return storage.setItem(key, value)
        }
        if (prop === 'removeItem') return key => { removed.push(key); return storage.removeItem(key) }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    Object.defineProperty(globalThis, 'localStorage', { value: storageFullForStash, configurable: true })
    try {
      store.getState().setUser({ id: 'next-user', name: 'Nia' })

      expect(stashWrites).toBe(2)
      expect(removed).not.toContain(WEB_STATE_KEY)
      expect(store.getState().getWebRecoveryRaw()).toBe(raw)
      expect(storage.getItem(WEB_STATE_KEY)).toBe(raw)
    } finally {
      Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })

  it('copies the exact corrupt payload into the versioned quarantine key', async () => {
    const raw = '{broken current state\nwith exact bytes'
    localStorage.setItem(WEB_STATE_KEY, raw)

    const store = await openApp()

    expect(store.getState().webRecovery).toMatchObject({ raw, quarantined: true, quarantineKey: WEB_STATE_QUARANTINE_KEY })
    expect(localStorage.getItem(WEB_STATE_QUARANTINE_KEY)).toBe(raw)
    expect(localStorage.getItem(WEB_STATE_KEY)).toBe(raw)
  })

  it('retains recovery in memory and leaves the original unchanged when quarantine storage refuses', async () => {
    const raw = '{broken current state'
    localStorage.setItem(WEB_STATE_KEY, raw)
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const storage = globalThis.localStorage
    const refusingStorage = new Proxy(storage, {
      get(target, prop) {
        const value = Reflect.get(target, prop)
        if (prop === 'setItem') return (key, value) => {
          if (key === WEB_STATE_QUARANTINE_KEY) throw new DOMException('quota', 'QuotaExceededError')
          return storage.setItem(key, value)
        }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    Object.defineProperty(globalThis, 'localStorage', { value: refusingStorage, configurable: true })
    try {
      const store = await openApp()
      expect(store.getState().webRecovery).toMatchObject({ raw, quarantined: false, quarantineKey: WEB_STATE_QUARANTINE_KEY })
      expect(store.getState().getWebRecoveryRaw()).toBe(raw)
      expect(storage.getItem(WEB_STATE_KEY)).toBe(raw)
      expect(storage.getItem(WEB_STATE_QUARANTINE_KEY)).toBeNull()
    } finally {
      Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })

  it('keeps a valid current profile out of recovery and persists ordinary updates', async () => {
    localStorage.setItem(WEB_STATE_KEY, JSON.stringify({ restSec: 77 }))
    const store = await openApp()

    expect(store.getState().webRecovery).toBeNull()
    store.getState().update(S => { S.restSec = 120 }, false)

    expect(JSON.parse(localStorage.getItem(WEB_STATE_KEY)).restSec).toBe(120)
  })

  it('still removes a valid current profile before the fresh sign-out state is saved', async () => {
    const raw = JSON.stringify({ routines: [{ id: 'signed-in-routine', ex: [] }] })
    localStorage.setItem(WEB_STATE_KEY, raw)
    localStorage.setItem('gym_user', JSON.stringify({ id: 'u1', name: 'Ana' }))
    const store = await openApp()
    const removeCurrent = vi.spyOn(localStorage, 'removeItem')
    try {
      await store.getState().signOut()

      expect(removeCurrent).toHaveBeenCalledWith(WEB_STATE_KEY)
      expect(localStorage.getItem(WEB_STATE_KEY)).not.toBe(raw)
      expect(JSON.parse(localStorage.getItem(WEB_STATE_KEY)).routines).toEqual([])
    } finally {
      removeCurrent.mockRestore()
    }
  })

  it('still removes a valid current profile before an account switch writes the new state', async () => {
    const raw = JSON.stringify({ routines: [{ id: 'previous-routine', ex: [] }] })
    localStorage.setItem(WEB_STATE_KEY, raw)
    localStorage.setItem('gym_owner', 'previous-user')
    const store = await openApp()
    const removeCurrent = vi.spyOn(localStorage, 'removeItem')
    try {
      store.getState().setUser({ id: 'next-user', name: 'Nia' })

      expect(removeCurrent).toHaveBeenCalledWith(WEB_STATE_KEY)
      expect(localStorage.getItem(WEB_STATE_KEY)).not.toBe(raw)
      expect(JSON.parse(localStorage.getItem(WEB_STATE_KEY)).routines).toEqual([])
    } finally {
      removeCurrent.mockRestore()
    }
  })

  it('still makes room by removing a valid current profile for keepForPrevious', async () => {
    const raw = JSON.stringify({ routines: [{ id: 'previous-routine', ex: [] }] })
    localStorage.setItem(WEB_STATE_KEY, raw)
    localStorage.setItem('gym_owner', 'previous-user')
    const store = await openApp()

    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    const storage = globalThis.localStorage
    let stashWrites = 0
    const removed = []
    const storageFullForStash = new Proxy(storage, {
      get(target, prop) {
        const value = Reflect.get(target, prop)
        if (prop === 'setItem') return (key, value) => {
          if (key === 'gym_stash' && stashWrites++ === 0) throw new DOMException('quota', 'QuotaExceededError')
          return storage.setItem(key, value)
        }
        if (prop === 'removeItem') return key => { removed.push(key); return storage.removeItem(key) }
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    Object.defineProperty(globalThis, 'localStorage', { value: storageFullForStash, configurable: true })
    try {
      store.getState().setUser({ id: 'next-user', name: 'Nia' })

      expect(stashWrites).toBe(2)
      expect(removed.filter(key => key === WEB_STATE_KEY)).toHaveLength(2)
      expect(localStorage.getItem(WEB_STATE_KEY)).not.toBe(raw)
    } finally {
      Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })

  it('keeps a valid legacy profile out of recovery and persists ordinary updates', async () => {
    localStorage.setItem(LEGACY_WEB_STATE_KEY, JSON.stringify({ restSec: 77 }))
    const store = await openApp()

    expect(store.getState().webRecovery).toBeNull()
    store.getState().update(S => { S.restSec = 120 }, false)

    expect(JSON.parse(localStorage.getItem(WEB_STATE_KEY)).restSec).toBe(120)
  })
})
