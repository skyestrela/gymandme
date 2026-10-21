// @vitest-environment node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const developmentEnvPath = fileURLToPath(new URL('../../.env.development', import.meta.url))
const packagePath = fileURLToPath(new URL('../../package.json', import.meta.url))

function readEnv(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => line.split('=', 2))
  )
}

function mobileBase(script, name) {
  return script.match(new RegExp(`${name}=([^ ]+)`))?.[1]
}

describe('development media configuration', () => {
  it('uses the pinned mobile CDN image and animation directories', () => {
    const developmentEnv = readEnv(developmentEnvPath)
    const mobileBuild = JSON.parse(readFileSync(packagePath, 'utf8')).scripts['build:mobile']
    const imageBase = mobileBase(mobileBuild, 'VITE_IMG_BASE')
    const gifBase = mobileBase(mobileBuild, 'VITE_GIF_BASE')

    expect(developmentEnv).toEqual({
      VITE_IMG_BASE: imageBase,
      VITE_GIF_BASE: gifBase,
    })
    expect(developmentEnv.VITE_IMG_BASE).toMatch(/\/images\/$/)
    expect(developmentEnv.VITE_GIF_BASE).toMatch(/\/videos\/$/)
  })
})
