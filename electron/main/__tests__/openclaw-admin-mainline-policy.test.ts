import { describe, expect, it } from 'vitest'

import {
  isMacSystemGlobalOpenClawPrefix,
  shouldPreferMacOpenClawAdminMainlineByProbe,
} from '../openclaw-admin-fallback-policy'

describe('openclaw admin mainline policy', () => {
  it('recognizes known macOS system-global prefixes', () => {
    expect(isMacSystemGlobalOpenClawPrefix('/usr/local', '/Users/tester')).toBe(true)
    expect(isMacSystemGlobalOpenClawPrefix('/opt/homebrew', '/Users/tester')).toBe(true)
  })

  it('rejects user-managed and custom external prefixes from the direct-admin mainline', () => {
    expect(
      isMacSystemGlobalOpenClawPrefix('/Users/tester/.nvm/versions/node/v22.0.0', '/Users/tester')
    ).toBe(false)
    expect(isMacSystemGlobalOpenClawPrefix('/opt/tools/openclaw', '/Users/tester')).toBe(false)
  })

  it('prefers direct admin only for resolved system-global prefixes', () => {
    expect(
      shouldPreferMacOpenClawAdminMainlineByProbe({
        prefixResolved: true,
        prefixPath: '/usr/local',
        userHome: '/Users/tester',
      })
    ).toBe(true)

    expect(
      shouldPreferMacOpenClawAdminMainlineByProbe({
        prefixResolved: true,
        prefixPath: '/opt/tools/openclaw',
        userHome: '/Users/tester',
      })
    ).toBe(false)

    expect(
      shouldPreferMacOpenClawAdminMainlineByProbe({
        prefixResolved: false,
        prefixPath: '/usr/local',
        userHome: '/Users/tester',
      })
    ).toBe(true)
  })
})
