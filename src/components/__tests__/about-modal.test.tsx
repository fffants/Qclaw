import { describe, expect, it } from 'vitest'

import { resolveAboutModalVersion } from '../AboutModal'

describe('AboutModal', () => {
  it('prefers the packaged app version from the main-process status payload', () => {
    expect(
      resolveAboutModalVersion({
        currentVersion: ' 2.2.7 ',
      })
    ).toBe('2.2.7')
  })

  it('does not fall back to a potentially mismatched renderer package version when status is empty', () => {
    expect(resolveAboutModalVersion(null)).toBe('')
    expect(resolveAboutModalVersion({ currentVersion: '' })).toBe('')
  })
})
