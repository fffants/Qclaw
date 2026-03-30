import { describe, expect, it, vi } from 'vitest'

import {
  repairKnownProviderConfigGaps,
  repairKnownProviderConfigGapsOnDisk,
} from '../openclaw-provider-config-repair'

describe('openclaw provider config repair', () => {
  it('fills the missing minimax-portal api metadata with the upstream anthropic runtime', () => {
    const result = repairKnownProviderConfigGaps({
      models: {
        providers: {
          'minimax-portal': {
            baseUrl: 'https://api.minimax.io/anthropic',
            models: [],
          },
        },
      },
    })

    expect(result.changed).toBe(true)
    expect(result.repairedJsonPaths).toEqual(['$.models.providers.minimax-portal.api'])
    expect(result.config).toEqual({
      models: {
        providers: {
          'minimax-portal': {
            baseUrl: 'https://api.minimax.io/anthropic',
            models: [],
            api: 'anthropic-messages',
          },
        },
      },
    })
  })

  it('leaves minimax-portal unchanged when the api metadata is already present', () => {
    const config = {
      models: {
        providers: {
          'minimax-portal': {
            baseUrl: 'https://api.minimax.io/anthropic',
            models: [],
            api: 'anthropic-messages',
          },
        },
      },
    }

    const result = repairKnownProviderConfigGaps(config)

    expect(result.changed).toBe(false)
    expect(result.config).toBe(config)
  })

  it('repairs the on-disk config only when the provider gap exists', async () => {
    const writeConfig = vi.fn(async () => undefined)

    const changedResult = await repairKnownProviderConfigGapsOnDisk({
      readConfig: async () => ({
        models: {
          providers: {
            'minimax-portal': {
              baseUrl: 'https://api.minimax.io/anthropic',
              models: [],
            },
          },
        },
      }),
      writeConfig,
    })

    expect(changedResult.changed).toBe(true)
    expect(writeConfig).toHaveBeenCalledWith({
      models: {
        providers: {
          'minimax-portal': {
            baseUrl: 'https://api.minimax.io/anthropic',
            models: [],
            api: 'anthropic-messages',
          },
        },
      },
    })

    writeConfig.mockClear()

    const unchangedResult = await repairKnownProviderConfigGapsOnDisk({
      readConfig: async () => ({
        models: {
          providers: {
            'minimax-portal': {
              baseUrl: 'https://api.minimax.io/anthropic',
              models: [],
              api: 'anthropic-messages',
            },
          },
        },
      }),
      writeConfig,
    })

    expect(unchangedResult.changed).toBe(false)
    expect(writeConfig).not.toHaveBeenCalled()
  })
})

