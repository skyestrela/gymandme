// @vitest-environment happy-dom

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted(() => ({
  recovery: null,
  raw: null,
  getRaw: vi.fn(),
  update: vi.fn(),
  pushState: vi.fn(),
  shareExport: vi.fn(),
  MOBILE: false,
}))

vi.mock('../store/useStore.js', () => {
  const snapshot = () => ({
    webRecovery: h.recovery,
    getWebRecoveryRaw: h.getRaw,
    update: h.update,
    pushState: h.pushState,
  })
  const useStore = selector => selector ? selector(snapshot()) : snapshot()
  useStore.getState = snapshot
  return { useStore, selectWebRecovery: state => state.webRecovery }
})
vi.mock('../lib/mobile.js', () => ({
  get MOBILE() { return h.MOBILE },
  shareExport: (...args) => h.shareExport(...args),
}))
vi.mock('../lib/i18n.js', () => ({ t: s => s }))

import WebRecoveryNotice, { exportRecoveryCopy } from './WebRecoveryNotice.jsx'

let host, root, fetchSpy
beforeEach(() => {
  h.recovery = null
  h.raw = null
  h.getRaw.mockReset()
  h.getRaw.mockImplementation(() => h.raw)
  h.update.mockReset()
  h.pushState.mockReset()
  h.shareExport.mockReset()
  h.MOBILE = false
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({})
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  fetchSpy.mockRestore()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const mount = () => act(() => root.render(<WebRecoveryNotice />))

describe('WebRecoveryNotice', () => {
  it('renders nothing for a healthy profile', () => {
    mount()
    expect(host.textContent).toBe('')
  })

  it('states that the original profile was not overwritten when recovery is active', () => {
    h.recovery = { kind: 'corrupt-current-web-state', raw: '{broken' }
    mount()

    expect(host.textContent).toContain('Your saved Gym&Me profile needs recovery.')
    expect(host.textContent).toContain('Gym&Me has not overwritten the original profile.')
    expect(host.textContent).toContain('Download a recovery copy before you reset or import anything.')
  })

  it('downloads the exact opaque recovery payload without updating, pushing, or calling an API', async () => {
    const raw = '{broken\n\u0000💪}'
    const blobs = []
    const createObjectURL = vi.fn(blob => { blobs.push(blob); return 'blob:recovery-copy' })
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() })
    const originalCreateElement = document.createElement.bind(document)
    const link = { click: vi.fn() }
    vi.spyOn(document, 'createElement').mockImplementation(tag => tag === 'a' ? link : originalCreateElement(tag))
    h.recovery = { kind: 'corrupt-current-web-state', raw }
    h.raw = raw
    mount()

    await act(async () => {
      ;[...host.querySelectorAll('button')].find(button => button.textContent.includes('Download recovery copy')).click()
      await Promise.resolve()
    })

    expect(h.getRaw).toHaveBeenCalledTimes(1)
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(await blobs[0].text()).toBe(raw)
    expect(h.update).not.toHaveBeenCalled()
    expect(h.pushState).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the web export blob with the exact raw text, without parsing or changing it', async () => {
    const raw = '  not-json\n{\"still\": raw}\n'
    const blobs = []
    const createObjectURL = vi.fn(blob => { blobs.push(blob); return 'blob:opaque' })
    const revokeObjectURL = vi.fn()
    const documentRef = { createElement: vi.fn(() => ({ click: vi.fn() })) }

    const blob = await exportRecoveryCopy(raw, { mobile: false, documentRef, urlRef: { createObjectURL, revokeObjectURL } })

    expect(await blob.text()).toBe(raw)
    expect(await blobs[0].text()).toBe(raw)
    expect(documentRef.createElement).toHaveBeenCalledWith('a')
  })

  it('shares the exact opaque recovery payload on mobile with the recovery-copy filename', async () => {
    const raw = '{broken\n\u0000💪}'
    const share = vi.fn().mockResolvedValue()

    const result = await exportRecoveryCopy(raw, { mobile: true, share })

    expect(result).toBe(raw)
    expect(share).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledWith(raw, 'gymandme-recovery-copy.txt')
  })

  it('releases the browser object URL 60 seconds after downloading the opaque recovery copy', async () => {
    vi.useFakeTimers()
    try {
      const raw = '  not-json\n{\"still\": raw}\n'
      const createObjectURL = vi.fn(() => 'blob:recovery-copy')
      const revokeObjectURL = vi.fn()
      const documentRef = { createElement: vi.fn(() => ({ click: vi.fn() })) }

      await exportRecoveryCopy(raw, { mobile: false, documentRef, urlRef: { createObjectURL, revokeObjectURL } })

      expect(revokeObjectURL).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(59999)
      expect(revokeObjectURL).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1)
      expect(revokeObjectURL).toHaveBeenCalledTimes(1)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:recovery-copy')
    } finally {
      vi.useRealTimers()
    }
  })
})
