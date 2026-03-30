import { describe, expect, it } from 'vitest'

import {
  mutatePairingAllowFromInConfig,
  normalizePairingAllowFromList,
  resolvePairingConfigTarget,
} from '../pairing-allowfrom-config'

function normalizeSenderForTest(channel: string, senderId: string): string | null {
  const raw = String(senderId || '').trim()
  if (!raw) return null
  if (channel === 'feishu') {
    const matched = raw.match(/\bou_[a-z0-9]{8,}\b/i)
    return matched?.[0]?.toLowerCase() || null
  }
  return raw
}

describe('pairing-allowfrom-config', () => {
  it('preserves wildcard entries while normalizing valid sender ids', () => {
    const result = normalizePairingAllowFromList(
      'feishu',
      ['*', ' OU_ABCDEF12345678 ', 'invalid'],
      normalizeSenderForTest,
      { preserveWildcard: true }
    )

    expect(result).toEqual(['*', 'ou_abcdef12345678'])
  })

  it('drops wildcard when preserveWildcard is not requested', () => {
    const result = normalizePairingAllowFromList(
      'feishu',
      ['*', 'ou_abcdef12345678'],
      normalizeSenderForTest
    )

    expect(result).toEqual(['ou_abcdef12345678'])
  })

  it('resolves feishu account target by accountId', () => {
    const target = resolvePairingConfigTarget(
      {
        channels: {
          feishu: {
            allowFrom: ['ou_default'],
            accounts: {
              work: {
                allowFrom: ['ou_work'],
              },
            },
          },
        },
      },
      'feishu',
      'work'
    )

    expect(target).toEqual({
      allowFrom: ['ou_work'],
    })
  })

  it('returns targetMissing when account config does not exist', () => {
    const config = {
      channels: {
        feishu: {
          allowFrom: ['ou_default'],
        },
      },
    }

    const result = mutatePairingAllowFromInConfig(
      config,
      'feishu',
      'ou_abcdef12345678',
      'add',
      {
        accountId: 'missing',
        normalizeSenderId: normalizeSenderForTest,
      }
    )

    expect(result).toEqual({
      changed: false,
      targetMissing: true,
    })
  })

  it('removes sender without dropping wildcard in target allowFrom', () => {
    const config = {
      channels: {
        feishu: {
          allowFrom: ['*', 'ou_abcdef12345678'],
        },
      },
    }

    const result = mutatePairingAllowFromInConfig(
      config,
      'feishu',
      'ou_abcdef12345678',
      'remove',
      {
        normalizeSenderId: normalizeSenderForTest,
      }
    )

    expect(result).toEqual({
      changed: true,
      targetMissing: false,
    })
    expect(config.channels.feishu.allowFrom).toEqual(['*'])
  })
})

