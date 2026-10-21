// @vitest-environment node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const viteConfigPath = fileURLToPath(new URL('../../vite.config.js', import.meta.url))
const tailnetHostname = 'ax16pro-wsl-new.tail07c964.ts.net'

describe('Vite Tailscale HTTPS host configuration', () => {
  it('allows only the verified WSL tailnet hostname while retaining local dev access', () => {
    const viteConfig = readFileSync(viteConfigPath, 'utf8')
    const server = viteConfig.match(/server:\s*\{([\s\S]*?)\n  \},\n  build:/)?.[1]
    const allowedHosts = server?.match(/allowedHosts:\s*\[([^\]]*)\]/)?.[1]

    expect(allowedHosts?.trim()).toBe(`'${tailnetHostname}'`)
    expect(server).toMatch(/fs:\s*\{\s*allow:\s*\['\.\.'\]\s*\}/)
    expect(server).toMatch(/proxy:\s*\{[\s\S]*?'\/api':[\s\S]*?'\/img':[\s\S]*?'\/gif'/)
  })
})
