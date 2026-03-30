import { describe, expect, it } from 'vitest'
import { extractConfiguredProviderIds } from '../dashboard-provider-extraction'

describe('extractConfiguredProviderIds', () => {
  it('reads providers from current models.providers structure', () => {
    const providerIds = extractConfiguredProviderIds({
      config: {
        models: {
          mode: 'merge',
          providers: {
            openai: {
              apiKey: 'OPENAI_API_KEY',
              models: [{ id: 'gpt-5.1-codex' }],
            },
            'custom-open-bigmodel-cn': {
              baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
              models: [{ id: 'glm-5' }],
            },
          },
        },
      },
      modelStatus: null,
    })

    expect(providerIds).toEqual(['openai', 'custom-open-bigmodel-cn'])
  })

  it('treats object-shaped effective status as configured providers', () => {
    const providerIds = extractConfiguredProviderIds({
      config: {
        models: {
          mode: 'merge',
          providers: {},
        },
      },
      modelStatus: {
        auth: {
          providers: [
            {
              provider: 'openai',
              effective: { kind: 'profiles' },
            },
            {
              provider: 'openai-codex',
              effective: { kind: 'profiles' },
            },
          ],
        },
      },
    })

    expect(providerIds).toEqual(['openai'])
  })

  it('includes auth profile providers from config for oauth-only entries', () => {
    const providerIds = extractConfiguredProviderIds({
      config: {
        auth: {
          profiles: {
            'openai-codex:default': {
              provider: 'openai-codex',
              mode: 'oauth',
            },
          },
        },
      },
      modelStatus: null,
    })

    expect(providerIds).toEqual(['openai'])
  })

  it('reads configured providers from auth.oauth.providers when auth.providers is absent', () => {
    const providerIds = extractConfiguredProviderIds({
      config: null,
      modelStatus: {
        auth: {
          oauth: {
            providers: [
              {
                provider: 'minimax-portal',
                status: 'ok',
                profiles: [{ profileId: 'minimax-portal:default' }],
              },
            ],
          },
        },
      },
    })

    expect(providerIds).toEqual(['minimax'])
  })

  it('does not infer configured providers from runtime model keys alone', () => {
    const providerIds = extractConfiguredProviderIds({
      config: null,
      modelStatus: {
        allowed: ['minimax-portal/MiniMax-M2.7', 'openai-codex/gpt-5.4'],
        defaultModel: 'minimax-portal/MiniMax-M2.7',
      },
    })

    expect(providerIds).toEqual([])
  })
})
