import { describe, expect, it } from 'vitest'
import { isProviderConfiguredInStatus } from '../openclaw-status'

describe('isProviderConfiguredInStatus', () => {
  it('returns true when auth status marks the provider as configured', () => {
    expect(
      isProviderConfiguredInStatus(
        {
          auth: {
            providers: [{ provider: 'openai', status: 'ok' }],
          },
        },
        'openai'
      )
    ).toBe(true)
  })

  it('returns true when allowed models imply the provider is configured', () => {
    expect(
      isProviderConfiguredInStatus(
        {
          allowed: ['qwen/qwen3-coder'],
        },
        'qwen'
      )
    ).toBe(true)
  })

  it('returns false when neither auth status nor allowed models mention the provider', () => {
    expect(
      isProviderConfiguredInStatus(
        {
          auth: {
            providers: [{ provider: 'openai', status: 'missing' }],
          },
          allowed: ['openai/gpt-5.1-codex'],
        },
        'mistral'
      )
    ).toBe(false)
  })
})
