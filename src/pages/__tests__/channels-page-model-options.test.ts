import { describe, expect, it, vi } from 'vitest'
import { ensureModelSelectOption, loadReadyModelSelectOptions } from '../channels-page-model-options'

describe('loadReadyModelSelectOptions', () => {
  it('filters to ready models after loading the full catalog', async () => {
    const listCatalog = vi.fn(async (query?: Record<string, unknown>) => {
      expect(query?.includeUnavailable).toBe(true)
      return {
        total: 1,
        items: [
          {
            key: 'openai/gpt-5.3-codex-spark',
            name: 'GPT-5.3 Codex Spark',
            available: true,
          },
        ],
      }
    })

    const options = await loadReadyModelSelectOptions(listCatalog)

    expect(listCatalog).toHaveBeenCalledWith(
      expect.objectContaining({
        includeUnavailable: true,
        page: 1,
      })
    )
    expect(options).toEqual([
      {
        value: 'openai/gpt-5.3-codex-spark',
        label: 'GPT-5.3 Codex Spark (openai/gpt-5.3-codex-spark)',
      },
    ])
  })

  it('keeps MiniMax models selectable when runtime readiness is reported through minimax-portal aliases', async () => {
    const listCatalog = vi.fn(async () => ({
      total: 1,
      items: [
        {
          key: 'minimax/MiniMax-M2.5',
          name: 'MiniMax M2.5',
          available: false,
        },
      ],
    }))

    const options = await loadReadyModelSelectOptions(listCatalog, {
      statusData: {
        auth: {
          providers: [{ provider: 'minimax-portal', status: 'ok' }],
        },
        allowed: ['minimax-portal/MiniMax-M2.5'],
        defaultModel: 'minimax-portal/MiniMax-M2.5',
      },
    })

    expect(options).toEqual([
      {
        value: 'minimax/MiniMax-M2.5',
        label: 'MiniMax M2.5 (minimax/MiniMax-M2.5)',
      },
    ])
  })

  it('prefers the current runtime model key when deduplicating alias-equivalent options', async () => {
    const listCatalog = vi.fn(async () => ({
      total: 2,
      items: [
        {
          key: 'minimax/MiniMax-M2.5',
          name: 'MiniMax M2.5',
          available: true,
        },
        {
          key: 'minimax-portal/MiniMax-M2.5',
          name: 'MiniMax M2.5',
          available: true,
        },
      ],
    }))

    const options = await loadReadyModelSelectOptions(listCatalog, {
      preferredModelKey: 'minimax-portal/MiniMax-M2.5',
    })

    expect(options).toEqual([
      {
        value: 'minimax-portal/MiniMax-M2.5',
        label: 'MiniMax M2.5 (minimax-portal/MiniMax-M2.5)',
      },
    ])
  })

  it('prefers the full CLI catalog over a partial upstream snapshot when building ready options', async () => {
    const listCatalog = vi.fn(async (query?: Record<string, unknown>) => {
      expect(query?.includeUnavailable).toBe(true)
      return {
        total: 2,
        items: [
          {
            key: 'openai/gpt-5.4',
            name: 'GPT-5.4',
            available: true,
          },
          {
            key: 'zai/glm-5',
            name: 'GLM-5',
            available: true,
          },
        ],
      }
    })

    const options = await loadReadyModelSelectOptions(listCatalog, {
      statusData: {
        allowed: ['openai/gpt-5.4', 'zai/glm-5'],
        defaultModel: 'openai/gpt-5.4',
      },
      readUpstreamState: async () => ({
        ok: true,
        source: 'control-ui-app',
        fallbackUsed: false,
        data: {
          source: 'control-ui-app',
          connected: true,
          hasClient: true,
          appKeys: [],
          catalogItemsLike: [
            {
              key: 'openai/gpt-5.4',
              provider: 'openai',
              name: 'GPT-5.4',
              available: true,
            },
          ],
        },
        diagnostics: {
          upstreamAvailable: true,
          connected: true,
          hasClient: true,
          hasHelloSnapshot: false,
          hasHealthResult: false,
          hasSessionsState: false,
          hasModelCatalogState: false,
          appKeys: [],
        },
      }),
    })

    expect(options).toEqual([
      {
        value: 'openai/gpt-5.4',
        label: 'GPT-5.4 (openai/gpt-5.4)',
      },
      {
        value: 'zai/glm-5',
        label: 'GLM-5 (zai/glm-5)',
      },
    ])
  })

  it('reuses the models page scoped catalog in all mode so feishu bot config can show every configured model', async () => {
    const listCatalog = vi.fn(async () => ({
      total: 2,
      items: [
        {
          key: 'zai/glm-5',
          provider: 'zai',
          name: 'GLM-5',
          available: true,
        },
        {
          key: 'openai/gpt-5.4',
          provider: 'openai',
          name: 'GPT-5.4',
          available: true,
        },
      ],
    }))

    const options = await loadReadyModelSelectOptions(listCatalog, {
      mode: 'all',
      envVars: {
        ZAI_API_KEY: 'zai-local',
      },
      configData: {
        models: {
          providers: {
            zai: {
              enabled: true,
              models: [
                { id: 'glm-5', name: 'GLM-5' },
                { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash' },
              ],
            },
          },
        },
      },
      statusData: {
        auth: {
          providers: [{ provider: 'zai', status: 'ok' }],
        },
        allowed: ['zai/glm-5'],
        defaultModel: 'zai/glm-5',
      },
      preferredModelKey: 'zai/glm-5',
    } as any)

    expect(options).toEqual([
      {
        value: 'zai/glm-5',
        label: 'GLM-5 (zai/glm-5)',
      },
      {
        value: 'zai/glm-4.5-flash',
        label: 'GLM-4.5 Flash (zai/glm-4.5-flash)',
      },
    ])
  })

  it('surfaces catalog load errors when no upstream snapshot can be used as fallback', async () => {
    const listCatalog = vi.fn(async () => {
      throw new Error('catalog down')
    })

    await expect(loadReadyModelSelectOptions(listCatalog)).rejects.toThrow('catalog down')
  })
})

describe('ensureModelSelectOption', () => {
  it('keeps the current runtime model selectable even when it is outside the ready catalog', () => {
    const options = ensureModelSelectOption(
      [{ value: 'openai/gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark (openai/gpt-5.3-codex-spark)' }],
      'openai/gpt-4o'
    )

    expect(options).toEqual([
      { value: 'openai/gpt-4o', label: 'openai/gpt-4o（当前）' },
      { value: 'openai/gpt-5.3-codex-spark', label: 'GPT-5.3 Codex Spark (openai/gpt-5.3-codex-spark)' },
    ])
  })

  it('adds the exact current runtime model when the catalog only contains an equivalent alias key', () => {
    const options = ensureModelSelectOption(
      [{ value: 'minimax/MiniMax-M2.5', label: 'MiniMax M2.5 (minimax/MiniMax-M2.5)' }],
      'minimax-portal/MiniMax-M2.5'
    )

    expect(options).toEqual([
      { value: 'minimax-portal/MiniMax-M2.5', label: 'minimax-portal/MiniMax-M2.5（当前）' },
      { value: 'minimax/MiniMax-M2.5', label: 'MiniMax M2.5 (minimax/MiniMax-M2.5)' },
    ])
  })
})
