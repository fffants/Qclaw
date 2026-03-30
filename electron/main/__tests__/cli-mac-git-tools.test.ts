import { describe, expect, it } from 'vitest'
import { buildMacDeveloperToolsProbeEnv } from '../mac-developer-tools'
import { buildTestEnv } from './test-env'

describe('buildMacDeveloperToolsProbeEnv', () => {
  it('removes DEVELOPER_DIR so stale Xcode paths do not break git probes', () => {
    const env = buildMacDeveloperToolsProbeEnv({
      ...buildTestEnv(),
      PATH: '/usr/bin:/bin',
      HOME: '/Users/tester',
      DEVELOPER_DIR: '/Applications/Xcode-old.app/Contents/Developer',
    })

    expect(env.PATH).toBe('/usr/bin:/bin')
    expect(env.HOME).toBe('/Users/tester')
    expect(env.DEVELOPER_DIR).toBeUndefined()
  })
})
