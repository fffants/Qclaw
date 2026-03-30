import { describe, expect, it } from 'vitest'
import { shouldShowSkipButtonForFeishuPairing } from './channel-connect-skip'

describe('shouldShowSkipButtonForFeishuPairing', () => {
  it('returns true when at least one feishu bot has paired users', () => {
    const statusByBot = {
      default: { pairedCount: 0, pairedUsers: [] },
      sales: { pairedCount: 2, pairedUsers: ['ou_1', 'ou_2'] },
    }

    expect(shouldShowSkipButtonForFeishuPairing(statusByBot)).toBe(true)
  })

  it('returns false when no pairing status exists', () => {
    expect(shouldShowSkipButtonForFeishuPairing({})).toBe(false)
  })

  it('returns false when all bots are unpaired', () => {
    const statusByBot = {
      default: { pairedCount: 0, pairedUsers: [] },
      ops: { pairedCount: 0, pairedUsers: [] },
    }

    expect(shouldShowSkipButtonForFeishuPairing(statusByBot)).toBe(false)
  })
})
