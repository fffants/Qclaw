import { describe, expect, it } from 'vitest'

import {
  FEISHU_OFFICIAL_PLUGIN_ID,
  FEISHU_OFFICIAL_PLUGIN_SPEC,
  prepareFeishuInstallerConfig,
} from '../feishu-installer-config'

describe('prepareFeishuInstallerConfig', () => {
  it('synthesizes an install record when the Feishu plugin already exists on disk', () => {
    const result = prepareFeishuInstallerConfig(
      {
        plugins: {
          allow: ['openclaw-lark', 'copilot-proxy'],
          entries: {
            'openclaw-lark': { enabled: true },
            'copilot-proxy': { enabled: true },
          },
        },
      },
      {
        pluginInstalledOnDisk: true,
        installPath: '/Users/alice/.openclaw/extensions/openclaw-lark',
      }
    )

    expect(result.changed).toBe(true)
    expect(result.config.plugins.allow).toEqual(['copilot-proxy'])
    expect(result.config.plugins.entries).toEqual({
      feishu: { enabled: false },
      'copilot-proxy': { enabled: true },
    })
    expect(result.config.plugins.installs[FEISHU_OFFICIAL_PLUGIN_ID]).toEqual({
      source: 'npm',
      spec: FEISHU_OFFICIAL_PLUGIN_SPEC,
      installPath: '/Users/alice/.openclaw/extensions/openclaw-lark',
    })
  })

  it('preserves an existing valid install record while stripping active config entries', () => {
    const result = prepareFeishuInstallerConfig(
      {
        plugins: {
          allow: ['openclaw-lark'],
          entries: {
            'openclaw-lark': { enabled: true },
          },
          installs: {
            'openclaw-lark': {
              source: 'npm',
              spec: '@larksuite/openclaw-lark',
              installPath: '/Users/alice/.openclaw/extensions/openclaw-lark',
              version: '2026.3.15',
            },
          },
        },
      },
      {
        pluginInstalledOnDisk: true,
        installPath: '/Users/alice/.openclaw/extensions/openclaw-lark',
      }
    )

    expect(result.changed).toBe(true)
    expect(result.config.plugins.allow).toEqual([])
    expect(result.config.plugins.entries).toEqual({
      feishu: { enabled: false },
    })
    expect(result.config.plugins.installs[FEISHU_OFFICIAL_PLUGIN_ID]).toEqual({
      source: 'npm',
      spec: '@larksuite/openclaw-lark',
      installPath: '/Users/alice/.openclaw/extensions/openclaw-lark',
      version: '2026.3.15',
    })
  })

  it('removes stale install metadata when the Feishu plugin is no longer on disk', () => {
    const result = prepareFeishuInstallerConfig(
      {
        plugins: {
          installs: {
            'openclaw-lark': {
              source: 'npm',
              spec: '@larksuite/openclaw-lark',
              installPath: '/Users/alice/.openclaw/extensions/openclaw-lark',
            },
          },
        },
      },
      {
        pluginInstalledOnDisk: false,
        installPath: '/Users/alice/.openclaw/extensions/openclaw-lark',
      }
    )

    expect(result.changed).toBe(true)
    expect(result.config.plugins.entries).toEqual({
      feishu: { enabled: false },
    })
    expect(result.config.plugins.installs).toEqual({})
  })
})
