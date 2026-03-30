import { describe, expect, it, vi } from 'vitest'
import { repairLegacyMiniMaxAliasConfigAfterOAuth } from '../minimax-legacy-alias-repair'

describe('repairLegacyMiniMaxAliasConfigAfterOAuth', () => {
  it('repairs legacy minimax aliases to minimax-portal after oauth success', async () => {
    const applyUpstreamModelWrite = vi.fn(async () => ({
      ok: true,
      wrote: true,
      gatewayReloaded: true,
      source: 'control-ui-config.apply',
      fallbackUsed: false,
    }))

    const result = await repairLegacyMiniMaxAliasConfigAfterOAuth({
      readConfig: async () => ({
        models: {
          providers: {
            'minimax-portal': {
              baseUrl: 'https://api.minimax.io/anthropic',
              models: [],
            },
          },
        },
        agents: {
          defaults: {
            model: {
              primary: 'minimax/MiniMax-M2.5',
            },
          },
          list: [
            {
              id: 'main',
              model: 'minimax/MiniMax-M2.5',
            },
            {
              id: 'feishu-bot',
              model: 'minimax/MiniMax-M2.1',
            },
          ],
        },
      }),
      readUpstreamState: async () => ({
        ok: true,
        source: 'control-ui-app',
        fallbackUsed: false,
        diagnostics: {
          upstreamAvailable: true,
          connected: true,
          hasClient: true,
          hasHelloSnapshot: true,
          hasHealthResult: false,
          hasSessionsState: false,
          hasModelCatalogState: false,
          appKeys: [],
        },
        data: {
          source: 'control-ui-app',
          connected: true,
          hasClient: true,
          appKeys: [],
          modelStatusLike: {
            defaultModel: 'minimax-portal/MiniMax-M2.5',
            allowed: ['minimax-portal/MiniMax-M2.5', 'minimax-portal/MiniMax-M2.1'],
            auth: {
              oauth: {
                providers: [{ provider: 'minimax-portal', status: 'ok' }],
              },
            },
          },
        },
      }),
      applyUpstreamModelWrite,
    })

    expect(result).toEqual({
      attempted: true,
      repaired: true,
      defaultRepaired: true,
      repairedAgentIds: ['main', 'feishu-bot'],
      reason: 'repaired',
    })
    expect(applyUpstreamModelWrite).toHaveBeenNthCalledWith(1, {
      kind: 'default',
      model: 'minimax-portal/MiniMax-M2.5',
    })
    expect(applyUpstreamModelWrite).toHaveBeenNthCalledWith(2, {
      kind: 'agent-primary',
      agentId: 'main',
      model: 'minimax-portal/MiniMax-M2.5',
    })
    expect(applyUpstreamModelWrite).toHaveBeenNthCalledWith(3, {
      kind: 'agent-primary',
      agentId: 'feishu-bot',
      model: 'minimax-portal/MiniMax-M2.1',
    })
  })

  it('repairs legacy minimax aliases after reauth even when upstream default still reports the old minimax key', async () => {
    const applyUpstreamModelWrite = vi.fn(async () => ({
      ok: true,
      wrote: true,
      gatewayReloaded: true,
      source: 'control-ui-config.apply',
      fallbackUsed: false,
    }))

    const result = await repairLegacyMiniMaxAliasConfigAfterOAuth({
      readConfig: async () => ({
        auth: {
          profiles: {
            'minimax-portal:default': {
              provider: 'minimax-portal',
              mode: 'oauth',
            },
          },
        },
        agents: {
          defaults: {
            model: {
              primary: 'minimax/MiniMax-M2.7-highspeed',
            },
          },
          list: [
            {
              id: 'main',
              model: 'minimax/MiniMax-M2.5',
            },
          ],
        },
      }),
      readUpstreamState: async () => ({
        ok: true,
        source: 'control-ui-app',
        fallbackUsed: false,
        diagnostics: {
          upstreamAvailable: true,
          connected: true,
          hasClient: true,
          hasHelloSnapshot: true,
          hasHealthResult: false,
          hasSessionsState: false,
          hasModelCatalogState: false,
          appKeys: [],
        },
        data: {
          source: 'control-ui-app',
          connected: true,
          hasClient: true,
          appKeys: [],
          modelStatusLike: {
            defaultModel: 'minimax/MiniMax-M2.7-highspeed',
            resolvedDefault: 'minimax/MiniMax-M2.7-highspeed',
            allowed: ['minimax-portal/MiniMax-M2.7-highspeed', 'minimax-portal/MiniMax-M2.5'],
            aliases: {
              'minimax-m2.7-highspeed': 'minimax-portal/MiniMax-M2.7-highspeed',
              'minimax-m2.5': 'minimax-portal/MiniMax-M2.5',
            },
            auth: {
              oauth: {
                providers: [{ provider: 'minimax-portal', status: 'ok' }],
              },
              missingProvidersInUse: ['minimax'],
            },
          },
        },
      }),
      applyUpstreamModelWrite,
    })

    expect(result).toEqual({
      attempted: true,
      repaired: true,
      defaultRepaired: true,
      repairedAgentIds: ['main'],
      reason: 'repaired',
    })
    expect(applyUpstreamModelWrite).toHaveBeenNthCalledWith(1, {
      kind: 'default',
      model: 'minimax-portal/MiniMax-M2.7-highspeed',
    })
    expect(applyUpstreamModelWrite).toHaveBeenNthCalledWith(2, {
      kind: 'agent-primary',
      agentId: 'main',
      model: 'minimax-portal/MiniMax-M2.5',
    })
  })

  it('falls back to a deterministic minimax-portal prefix rewrite when auth is ready before upstream candidates refresh', async () => {
    const applyUpstreamModelWrite = vi.fn(async () => ({
      ok: true,
      wrote: true,
      gatewayReloaded: false,
      source: 'control-ui-config.apply',
      fallbackUsed: false,
    }))

    const result = await repairLegacyMiniMaxAliasConfigAfterOAuth({
      readConfig: async () => ({
        auth: {
          profiles: {
            'minimax-portal:default': {
              provider: 'minimax-portal',
              mode: 'oauth',
            },
          },
        },
        agents: {
          defaults: {
            model: {
              primary: 'minimax/MiniMax-M2.7-highspeed',
            },
          },
          list: [
            {
              id: 'main',
              model: 'minimax/MiniMax-M2.5',
            },
          ],
        },
      }),
      readUpstreamState: async () => ({
        ok: true,
        source: 'control-ui-app',
        fallbackUsed: false,
        diagnostics: {
          upstreamAvailable: true,
          connected: true,
          hasClient: true,
          hasHelloSnapshot: true,
          hasHealthResult: false,
          hasSessionsState: false,
          hasModelCatalogState: false,
          appKeys: [],
        },
        data: {
          source: 'control-ui-app',
          connected: true,
          hasClient: true,
          appKeys: [],
          modelStatusLike: {
            defaultModel: 'minimax/MiniMax-M2.7-highspeed',
            auth: {
              oauth: {
                providers: [{ provider: 'minimax-portal', status: 'ok' }],
              },
              missingProvidersInUse: ['minimax'],
            },
          },
        },
      }),
      applyUpstreamModelWrite,
    })

    expect(result).toEqual({
      attempted: true,
      repaired: true,
      defaultRepaired: true,
      repairedAgentIds: ['main'],
      reason: 'repaired',
    })
    expect(applyUpstreamModelWrite).toHaveBeenNthCalledWith(1, {
      kind: 'default',
      model: 'minimax-portal/MiniMax-M2.7-highspeed',
    })
    expect(applyUpstreamModelWrite).toHaveBeenNthCalledWith(2, {
      kind: 'agent-primary',
      agentId: 'main',
      model: 'minimax-portal/MiniMax-M2.5',
    })
  })
})
