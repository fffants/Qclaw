import { describe, expect, it, vi } from 'vitest'

import {
  extractStalePluginConfigEntryIds,
  pruneStalePluginConfigEntries,
  repairStalePluginConfigFromCommandResult,
} from '../openclaw-config-warnings'

const RAW_STALE_PLUGIN_WARNING =
  'Config warnings:\n- plugins.entries.MiniMax-M2.5: plugin not found: MiniMax-M2.5 (stale config entry ignored; remove it from plugins config)'

const RAW_STALE_PLUGIN_ALLOW_WARNING =
  'Config warnings:\n- plugins.allow: plugin not found: minimax-portal-auth (stale config entry ignored; remove it from plugins config)'

const RAW_GENERIC_STALE_PLUGIN_ALLOW_WARNING =
  'Config warnings:\n- plugins.allow: plugin not found: fake-stale-plugin (stale config entry ignored; remove it from plugins config)'

const RAW_STALE_PLUGIN_REMOVED_WARNING =
  'Config warnings:\n- plugins.entries.fake-stale-plugin: plugin removed: fake-stale-plugin (stale config entry ignored; remove it from plugins config)'

describe('openclaw config warnings', () => {
  it('extracts stale plugin entry ids from config warning output', () => {
    expect(extractStalePluginConfigEntryIds(RAW_STALE_PLUGIN_WARNING)).toEqual(['MiniMax-M2.5'])
  })

  it('extracts stale plugin ids from plugins.allow warning output', () => {
    expect(extractStalePluginConfigEntryIds(RAW_STALE_PLUGIN_ALLOW_WARNING)).toEqual(['minimax-portal-auth'])
  })

  it('extracts generic stale plugin ids from plugins.allow warning output', () => {
    expect(extractStalePluginConfigEntryIds(RAW_GENERIC_STALE_PLUGIN_ALLOW_WARNING)).toEqual(['fake-stale-plugin'])
  })

  it('extracts stale plugin ids from plugin removed warning output', () => {
    expect(extractStalePluginConfigEntryIds(RAW_STALE_PLUGIN_REMOVED_WARNING)).toEqual(['fake-stale-plugin'])
  })

  it('removes stale plugin ids from both plugin entries and allow lists', async () => {
    const writeConfig = vi.fn(async () => {})

    const result = await pruneStalePluginConfigEntries(['MiniMax-M2.5', 'minimax-portal-auth', 'fake-stale-plugin'], {
      readConfig: async () => ({
        meta: { lastTouchedVersion: '2026.3.12' },
        channels: {
          feishu: {
            enabled: true,
          },
        },
        models: {
          providers: {
            'minimax-portal': {
              api: 'anthropic-messages',
            },
          },
        },
        auth: {
          providers: ['openai'],
        },
        plugins: {
          allow: [
            'google-gemini-cli-auth',
            'minimax-portal-auth',
            'fake-stale-plugin',
          ],
          entries: {
            'google-gemini-cli-auth': { enabled: true },
            'MiniMax-M2.5': { enabled: true },
            'fake-stale-plugin': { enabled: false },
          },
          installs: {
            'fake-stale-plugin': { installPath: '/tmp/extensions/fake-stale-plugin' },
          },
        },
      }),
      writeConfig,
    })

    expect(result).toEqual({
      changed: true,
      removedPluginIds: ['MiniMax-M2.5', 'minimax-portal-auth', 'fake-stale-plugin'],
    })
    expect(writeConfig).toHaveBeenCalledWith({
      meta: { lastTouchedVersion: '2026.3.12' },
      channels: {
        feishu: {
          enabled: true,
        },
      },
      models: {
        providers: {
          'minimax-portal': {
            api: 'anthropic-messages',
          },
        },
      },
      auth: {
        providers: ['openai'],
      },
      plugins: {
        allow: [
          'google-gemini-cli-auth',
        ],
        entries: {
          'google-gemini-cli-auth': { enabled: true },
        },
        installs: {},
      },
    })
  })

  it('preserves channel config while removing stale managed plugin records by default', async () => {
    const writeConfig = vi.fn(async () => {})

    const result = await pruneStalePluginConfigEntries(['openclaw-weixin', 'wecom-openclaw-plugin'], {
      readConfig: async () => ({
        channels: {
          'openclaw-weixin': {
            enabled: true,
          },
          wecom: {
            enabled: true,
          },
          feishu: {
            enabled: true,
          },
        },
        plugins: {
          installs: {
            'openclaw-weixin': {
              installPath: '/tmp/extensions/openclaw-weixin',
            },
            'wecom-openclaw-plugin': {
              installPath: '/tmp/extensions/wecom-openclaw-plugin',
            },
            'openclaw-lark': {
              installPath: '/tmp/extensions/openclaw-lark',
            },
          },
        },
      }),
      writeConfig,
    })

    expect(result).toEqual({
      changed: true,
      removedPluginIds: ['openclaw-weixin', 'wecom-openclaw-plugin'],
    })
    expect(writeConfig).toHaveBeenCalledWith({
      channels: {
        'openclaw-weixin': {
          enabled: true,
        },
        wecom: {
          enabled: true,
        },
        feishu: {
          enabled: true,
        },
      },
      plugins: {
        installs: {
          'openclaw-lark': {
            installPath: '/tmp/extensions/openclaw-lark',
          },
        },
      },
    })
  })

  it('only prunes associated managed channels when the caller explicitly opts in', async () => {
    const writeConfig = vi.fn(async () => {})

    const result = await pruneStalePluginConfigEntries(['openclaw-weixin', 'wecom-openclaw-plugin'], {
      readConfig: async () => ({
        channels: {
          'openclaw-weixin': {
            enabled: true,
          },
          wecom: {
            enabled: true,
          },
          feishu: {
            enabled: true,
          },
        },
        plugins: {
          installs: {
            'openclaw-weixin': {
              installPath: '/tmp/extensions/openclaw-weixin',
            },
            'wecom-openclaw-plugin': {
              installPath: '/tmp/extensions/wecom-openclaw-plugin',
            },
            'openclaw-lark': {
              installPath: '/tmp/extensions/openclaw-lark',
            },
          },
        },
      }),
      writeConfig,
      pruneManagedChannels: true,
    })

    expect(result).toEqual({
      changed: true,
      removedPluginIds: ['openclaw-weixin', 'wecom-openclaw-plugin'],
    })
    expect(writeConfig).toHaveBeenCalledWith({
      channels: {
        feishu: {
          enabled: true,
        },
      },
      plugins: {
        installs: {
          'openclaw-lark': {
            installPath: '/tmp/extensions/openclaw-lark',
          },
        },
      },
    })
  })

  it('returns empty repair metadata when command output has no stale plugin warnings', async () => {
    const pruneStalePluginEntries = vi.fn(async () => ({
      changed: true,
      removedPluginIds: ['fake-stale-plugin'],
    }))

    const result = await repairStalePluginConfigFromCommandResult(
      {
        stdout: '{"ok":true}',
        stderr: '',
      },
      {
        pruneStalePluginEntries,
      }
    )

    expect(result).toEqual({
      stalePluginIds: [],
      changed: false,
      removedPluginIds: [],
    })
    expect(pruneStalePluginEntries).not.toHaveBeenCalled()
  })

  it('deduplicates repeated stale ids and prunes them once from command result output', async () => {
    const pruneStalePluginEntries = vi.fn(async () => ({
      changed: true,
      removedPluginIds: ['fake-stale-plugin'],
    }))

    const result = await repairStalePluginConfigFromCommandResult(
      {
        stdout: `${RAW_GENERIC_STALE_PLUGIN_ALLOW_WARNING}\n${RAW_STALE_PLUGIN_REMOVED_WARNING}`,
        stderr: RAW_GENERIC_STALE_PLUGIN_ALLOW_WARNING,
      },
      {
        pruneStalePluginEntries,
      }
    )

    expect(result).toEqual({
      stalePluginIds: ['fake-stale-plugin'],
      changed: true,
      removedPluginIds: ['fake-stale-plugin'],
    })
    expect(pruneStalePluginEntries).toHaveBeenCalledWith(['fake-stale-plugin'])
  })
})
