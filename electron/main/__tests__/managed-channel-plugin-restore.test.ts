import { describe, expect, it, vi } from 'vitest'

import { restoreConfiguredManagedChannelPlugins } from '../managed-channel-plugin-restore'

describe('restoreConfiguredManagedChannelPlugins', () => {
  it('restores configured generic managed channels through the shared lifecycle repair service', async () => {
    const inspectManagedChannelPlugin = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'config-sync-required',
        channelId: 'wecom',
        pluginScope: 'channel',
        entityScope: 'channel',
        reason: '当前插件配置仍待同步',
        status: {
          channelId: 'wecom',
          pluginId: 'wecom-openclaw-plugin',
          summary: '企微官方插件已安装，但配置仍待同步。',
          stages: [
            { id: 'installed', state: 'verified', source: 'disk', message: 'installed' },
            { id: 'registered', state: 'verified', source: 'plugins-list', message: 'registered' },
            { id: 'loaded', state: 'unknown', source: 'status', message: 'unknown' },
            { id: 'ready', state: 'unknown', source: 'status', message: 'unknown' },
          ],
          evidence: [],
        },
      })
    const repairManagedChannelPlugin = vi.fn().mockResolvedValue({
      kind: 'ok',
      channelId: 'wecom',
      pluginScope: 'channel',
      entityScope: 'channel',
      action: 'installed',
      status: {
        channelId: 'wecom',
        pluginId: 'wecom-openclaw-plugin',
        summary: '企微官方插件已安装并已注册；loaded / ready 仍待上游证据。',
        stages: [
          { id: 'installed', state: 'verified', source: 'disk', message: 'installed' },
          { id: 'registered', state: 'verified', source: 'plugins-list', message: 'registered' },
          { id: 'loaded', state: 'unknown', source: 'status', message: 'unknown' },
          { id: 'ready', state: 'unknown', source: 'status', message: 'unknown' },
        ],
        evidence: [],
      },
    })

    const result = await restoreConfiguredManagedChannelPlugins({
      referenceConfig: {
        channels: {
          wecom: {
            enabled: true,
            botId: 'bot_123',
            secret: 'secret_456',
          },
        },
      },
      repairResult: {
        quarantinedPluginIds: [],
        prunedPluginIds: [],
      },
      dependencies: {
        inspectManagedChannelPlugin,
        repairManagedChannelPlugin,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.restoredChannelIds).toEqual(['wecom'])
    expect(result.gatewayReloaded).toBe(true)
    expect(inspectManagedChannelPlugin).toHaveBeenCalledWith('wecom')
    expect(repairManagedChannelPlugin).toHaveBeenCalledWith('wecom')
  })

  it('skips restore when inspection shows the configured plugin is already healthy enough', async () => {
    const inspectManagedChannelPlugin = vi.fn().mockResolvedValue({
      kind: 'plugin-ready-channel-not-ready',
      channelId: 'wecom',
      pluginScope: 'channel',
      entityScope: 'channel',
      blockingReason: '插件安装与注册已确认，但缺少渠道运行态证明',
      status: {
        channelId: 'wecom',
        pluginId: 'wecom-openclaw-plugin',
        summary: '企微官方插件已安装并已注册；loaded / ready 仍待上游证据。',
        stages: [
          { id: 'installed', state: 'verified', source: 'disk', message: 'installed' },
          { id: 'registered', state: 'verified', source: 'plugins-list', message: 'registered' },
          { id: 'loaded', state: 'unknown', source: 'status', message: 'unknown' },
          { id: 'ready', state: 'unknown', source: 'status', message: 'unknown' },
        ],
        evidence: [],
      },
    })
    const repairManagedChannelPlugin = vi.fn()

    const result = await restoreConfiguredManagedChannelPlugins({
      referenceConfig: {
        channels: {
          wecom: {
            enabled: true,
            botId: 'bot_123',
            secret: 'secret_456',
          },
        },
      },
      repairResult: {
        quarantinedPluginIds: [],
        prunedPluginIds: [],
      },
      dependencies: {
        inspectManagedChannelPlugin,
        repairManagedChannelPlugin,
      },
    })

    expect(result).toEqual({
      ok: true,
      restoredChannelIds: [],
      gatewayReloaded: false,
      summary: '未发现需要恢复的已配置官方渠道插件。',
      stderr: '',
    })
    expect(inspectManagedChannelPlugin).toHaveBeenCalledWith('wecom')
    expect(repairManagedChannelPlugin).not.toHaveBeenCalled()
  })

  it('skips background restore for interactive-installer channels and leaves them for foreground repair', async () => {
    const inspectManagedChannelPlugin = vi.fn()
    const repairManagedChannelPlugin = vi.fn()

    const result = await restoreConfiguredManagedChannelPlugins({
      referenceConfig: {
        channels: {
          'openclaw-weixin': {
            enabled: true,
            accounts: {
              'wx-account': {
                enabled: true,
              },
            },
          },
        },
      },
      repairResult: {
        quarantinedPluginIds: ['openclaw-weixin'],
        prunedPluginIds: [],
      },
      dependencies: {
        inspectManagedChannelPlugin,
        repairManagedChannelPlugin,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.restoredChannelIds).toEqual([])
    expect(result.gatewayReloaded).toBe(false)
    expect(inspectManagedChannelPlugin).not.toHaveBeenCalled()
    expect(repairManagedChannelPlugin).not.toHaveBeenCalled()
  })

  it('skips restore when no managed channel is meaningfully configured', async () => {
    const dependencies = {
      inspectManagedChannelPlugin: vi.fn(),
      repairManagedChannelPlugin: vi.fn(),
    }

    const result = await restoreConfiguredManagedChannelPlugins({
      referenceConfig: {
        channels: {
          wecom: {
            enabled: true,
          },
        },
      },
      repairResult: {
        quarantinedPluginIds: ['wecom-openclaw-plugin'],
        prunedPluginIds: [],
      },
      dependencies,
    })

    expect(result).toEqual({
      ok: true,
      restoredChannelIds: [],
      gatewayReloaded: false,
      summary: '未发现需要恢复的已配置官方渠道插件。',
      stderr: '',
    })
    expect(dependencies.inspectManagedChannelPlugin).not.toHaveBeenCalled()
    expect(dependencies.repairManagedChannelPlugin).not.toHaveBeenCalled()
  })
})
