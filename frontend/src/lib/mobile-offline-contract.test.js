// @vitest-environment node

// Static source-regression contracts for the offline delivery path. These inspect
// source text only; they are not an end-to-end device or browser-worker test.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const frontendRoot = new URL('../../', import.meta.url)
const source = path => readFileSync(new URL(path, frontendRoot), 'utf8')

describe('mobile offline static regression contracts (not end-to-end device tests)', () => {
  it('statically preserves the HTTPS-only web service-worker registration contract', () => {
    const main = source('src/main.jsx')

    expect(main).toContain("!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:'")
    expect(main).toContain("navigator.serviceWorker.register('sw.js')")
  })

  it('unregisters a stale worker against the dev server, keeping device and media caches', () => {
    const main = source('src/main.jsx')

    // Dev never installs the offline worker, and drops only the app-shell cache it left behind.
    expect(main).toContain('import.meta.env.DEV')
    expect(main).toContain('getRegistrations')
    expect(main).toContain("k.startsWith('opengym-rt-')")
    // The device id and the offline media are not the code that changed; a reload costs neither.
    expect(main).not.toContain("caches.delete('opengym-device')")
    expect(main).not.toContain("caches.delete('opengym-media-v1')")
    // The offline worker stays, in the production branch behind the dev one.
    expect(main).toContain("} else if (!MOBILE && 'serviceWorker' in navigator && location.protocol === 'https:') {")
    expect(main.indexOf('if (import.meta.env.DEV)')).toBeLessThan(
      main.indexOf("navigator.serviceWorker.register('sw.js')"))
  })

  it('statically preserves the service-worker app-shell caching contract', () => {
    const worker = source('public/sw.js')

    // The source cache version intentionally has a build-time placeholder; artifact stamping is
    // covered outside this source contract.
    expect(worker).toContain("c.put('index.html'")
  })

  it('never caches or serves the dev server module graph from the offline worker', () => {
    const worker = source('public/sw.js')

    expect(worker).toContain('const isDevModule = url =>')
    expect(worker).toContain('if (isDevModule(url)) return')
    // The bypass has to sit with the other never-cache rules, before the media and shell paths.
    const bypass = worker.indexOf('if (isDevModule(url)) return')
    expect(bypass).toBeGreaterThan(worker.indexOf('never cache auth/data'))
    expect(bypass).toBeLessThan(worker.indexOf('isMediaPath(url.pathname)'))
    // /src, /@vite, /@fs and /node_modules/.vite are dev-only: public/ ships icons, manifest, sw.
    expect(worker).toContain('node_modules')
    // The shell itself is still cached for the offline app; only the dev graph is skipped.
    expect(worker).toContain("c.put('index.html'")
  })

  it('statically preserves the native private-data file mirror contract', () => {
    const mobile = source('src/lib/mobile.js')
    const nativeSave = mobile.match(/export async function nativeSave\(state\) \{[\s\S]*?\n\}/)?.[0]

    expect(nativeSave).toBeDefined()
    expect(nativeSave).toMatch(/Filesystem\.writeFile\(\{\s*path:\s*MOBILE_STATE_FILE,\s*directory:\s*Directory\.Data/)
  })
})
