import { describe, expect, it } from 'vitest'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

function readElectronBuilderConfig(): Record<string, unknown> {
  const configPath = path.join(process.cwd(), 'electron-builder.json')
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
}

describe('electron-builder mac dmg config', () => {
  it('does not pass an empty dmg title that would collapse the mounted volume path to /Volumes', () => {
    const config = readElectronBuilderConfig()
    const dmg = (config.dmg ?? {}) as Record<string, unknown>

    if (!Object.prototype.hasOwnProperty.call(dmg, 'title')) {
      expect(dmg.title).toBeUndefined()
      return
    }

    expect(typeof dmg.title).toBe('string')
    expect(String(dmg.title).trim().length).toBeGreaterThan(0)
  })
})
