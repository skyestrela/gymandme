import { afterEach, describe, expect, it, vi } from 'vitest'
import { checkForUpdate, downloadAndInstall, resetUpdateCheck, sha256, UPDATES_CONFIGURED } from './update.js'

afterEach(() => {
  resetUpdateCheck()
  vi.restoreAllMocks()
})

describe('sha256', () => {
  it('computes the correct hash for a known input', async () => {
    const input = new TextEncoder().encode('hello world')
    expect(await sha256(input.buffer)).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9')
  })
})

describe('Gym&Me updates before publishing is configured', () => {
  it('always reports no update without making a network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    await expect(checkForUpdate()).resolves.toEqual({
      hasUpdate: false,
      latestVersion: __APP_VERSION__,
      apkUrl: null,
      hashUrl: null,
    })

    expect(UPDATES_CONFIGURED).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a direct download request without networking or reporting download progress', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const onProgress = vi.fn()

    await expect(downloadAndInstall('https://example.invalid/GymAndMe.apk', null, onProgress)).rejects.toThrow('Gym&Me updates are not configured yet')

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(onProgress).not.toHaveBeenCalled()
  })
})
