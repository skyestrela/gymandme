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

  it('statically preserves the service-worker app-shell caching contract', () => {
    const worker = source('public/sw.js')

    // The source cache version intentionally has a build-time placeholder; artifact stamping is
    // covered outside this source contract.
    expect(worker).toContain("c.put('index.html'")
  })

  it('statically preserves the native private-data file mirror contract', () => {
    const mobile = source('src/lib/mobile.js')
    const nativeSave = mobile.match(/export async function nativeSave\(state\) \{[\s\S]*?\n\}/)?.[0]

    expect(nativeSave).toBeDefined()
    expect(nativeSave).toMatch(/Filesystem\.writeFile\(\{\s*path:\s*MOBILE_STATE_FILE,\s*directory:\s*Directory\.Data/)
  })
})
