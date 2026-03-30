import { describe, expect, it } from 'vitest'

import {
  reconcileTrustedPluginAllowlist,
  restoreTrustedPluginConfig,
} from '../openclaw-plugin-config'

describe('openclaw plugin config helpers', () => {
  it('rebuilds plugins.allow from trusted entries and installs', () => {
    const result = reconcileTrustedPluginAllowlist({
      plugins: {
        allow: ['feishu'],
        entries: {
          feishu: { enabled: true },
          'minimax-portal-auth': { enabled: true },
          'openclaw-lark': { enabled: true },
        },
        installs: {
          feishu: { spec: '@larksuiteoapi/feishu-openclaw-plugin' },
          'openclaw-lark': { spec: '@larksuite/openclaw-lark' },
        },
      },
    })

    expect(result.changed).toBe(true)
    expect(result.restoredPluginIds).toEqual(['minimax-portal-auth', 'openclaw-lark'])
    expect(result.config.plugins.allow).toEqual(['minimax-portal-auth', 'openclaw-lark'])
    expect(result.config.plugins.entries).toEqual({
      feishu: { enabled: false },
      'minimax-portal-auth': { enabled: true },
      'openclaw-lark': { enabled: true },
    })
    expect(result.config.plugins.installs).not.toHaveProperty('feishu')
  })

  it('restores trusted plugin metadata from a reference config after onboard rewrites it', () => {
    const result = restoreTrustedPluginConfig(
      {
        plugins: {
          allow: ['minimax-portal-auth', 'openclaw-lark'],
          entries: {
            'minimax-portal-auth': { enabled: true },
            'openclaw-lark': { enabled: true },
          },
          installs: {
            'openclaw-lark': { spec: '@larksuite/openclaw-lark' },
          },
        },
      },
      {
        plugins: {
          allow: [],
        },
      }
    )

    expect(result.changed).toBe(true)
    expect(result.restoredPluginIds).toEqual(['minimax-portal-auth', 'openclaw-lark'])
    expect(result.config.plugins.allow).toEqual(['minimax-portal-auth', 'openclaw-lark'])
    expect(result.config.plugins.entries).toEqual({
      feishu: { enabled: false },
      'minimax-portal-auth': { enabled: true },
      'openclaw-lark': { enabled: true },
    })
    expect(result.config.plugins.installs).toEqual({
      'openclaw-lark': { spec: '@larksuite/openclaw-lark' },
    })
  })

  it('rebuilds plugins.allow without restoring blocked stale ids', () => {
    const result = reconcileTrustedPluginAllowlist(
      {
        plugins: {
          allow: ['feishu', 'minimax-portal-auth'],
          entries: {
            feishu: { enabled: true },
            'minimax-portal-auth': { enabled: true },
            'openclaw-lark': { enabled: true },
          },
          installs: {
            'minimax-portal-auth': { spec: '@openclaw/minimax-portal-auth' },
            'openclaw-lark': { spec: '@larksuite/openclaw-lark' },
          },
        },
      },
      {
        blockedPluginIds: ['minimax-portal-auth'],
      }
    )

    expect(result.changed).toBe(true)
    expect(result.restoredPluginIds).toEqual(['openclaw-lark'])
    expect(result.config.plugins.allow).toEqual(['openclaw-lark'])
    expect(result.config.plugins.entries).toEqual({
      feishu: { enabled: false },
      'openclaw-lark': { enabled: true },
    })
    expect(result.config.plugins.installs).toEqual({
      'openclaw-lark': { spec: '@larksuite/openclaw-lark' },
    })
  })

  it('restores trusted plugin metadata without reviving blocked stale ids and preserves non-plugin config', () => {
    const result = restoreTrustedPluginConfig(
      {
        channels: {
          feishu: { enabled: true },
        },
        models: {
          providers: {
            'minimax-portal': {
              api: 'anthropic-messages',
            },
          },
        },
        plugins: {
          allow: ['minimax-portal-auth', 'openclaw-lark'],
          entries: {
            'minimax-portal-auth': { enabled: true },
            'openclaw-lark': { enabled: true },
          },
          installs: {
            'minimax-portal-auth': { spec: '@openclaw/minimax-portal-auth' },
            'openclaw-lark': { spec: '@larksuite/openclaw-lark' },
          },
        },
      },
      {
        channels: {
          feishu: { enabled: true },
        },
        models: {
          providers: {
            'minimax-portal': {
              api: 'anthropic-messages',
            },
          },
        },
        plugins: {
          allow: [],
        },
      },
      {
        blockedPluginIds: ['minimax-portal-auth'],
      }
    )

    expect(result.changed).toBe(true)
    expect(result.restoredPluginIds).toEqual(['openclaw-lark'])
    expect(result.config.channels).toEqual({
      feishu: { enabled: true },
    })
    expect(result.config.models).toEqual({
      providers: {
        'minimax-portal': {
          api: 'anthropic-messages',
        },
      },
    })
    expect(result.config.plugins.allow).toEqual(['openclaw-lark'])
    expect(result.config.plugins.entries).toEqual({
      feishu: { enabled: false },
      'openclaw-lark': { enabled: true },
    })
    expect(result.config.plugins.installs).toEqual({
      'openclaw-lark': { spec: '@larksuite/openclaw-lark' },
    })
  })

  it('drops legacy feishu plugin ids from the target config during restore', () => {
    const result = restoreTrustedPluginConfig(
      {
        plugins: {
          allow: ['openclaw-lark'],
          entries: {
            'openclaw-lark': { enabled: true },
          },
          installs: {
            'openclaw-lark': { spec: '@larksuite/openclaw-lark' },
          },
        },
      },
      {
        plugins: {
          allow: ['feishu', 'openclaw-lark'],
          entries: {
            feishu: { enabled: true },
            'openclaw-lark': { enabled: true },
          },
          installs: {
            feishu: { spec: '@larksuiteoapi/feishu-openclaw-plugin' },
            'openclaw-lark': { spec: '@larksuite/openclaw-lark' },
          },
        },
      }
    )

    expect(result.changed).toBe(true)
    expect(result.config.plugins.allow).toEqual(['openclaw-lark'])
    expect(result.config.plugins.entries).toEqual({
      feishu: { enabled: false },
      'openclaw-lark': { enabled: true },
    })
    expect(result.config.plugins.installs).not.toHaveProperty('feishu')
  })
})
