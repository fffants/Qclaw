import { describe, expect, it } from 'vitest'
import {
  getChannelEnabledLabel,
  shouldReuseModelOptionsCache,
  shouldShowFeishuPluginRepairAction,
  shouldShowPluginStatus,
} from '../ChannelsPage'

const fs = process.getBuiltinModule('node:fs') as typeof import('node:fs')
const path = process.getBuiltinModule('node:path') as typeof import('node:path')

describe('channels page state helpers', () => {
  it('uses enabled/disabled wording instead of treating config presence as readiness', () => {
    expect(getChannelEnabledLabel(true)).toBe('已启用')
    expect(getChannelEnabledLabel(false)).toBe('已禁用')
  })

  it('keeps plugin status visible for any row that already carries shared managed evidence', () => {
    expect(
      shouldShowPluginStatus({
        pluginStatus: {
          channelId: 'feishu',
          pluginId: 'openclaw-lark',
          summary: '飞书官方插件已安装并已注册；loaded / ready 仍待上游证据。',
          stages: [],
          evidence: [],
        },
      })
    ).toBe(true)

    expect(
      shouldShowPluginStatus({
        pluginStatus: null,
      })
    ).toBe(false)
  })

  it('adds a direct feishu plugin repair action to the channel card actions', () => {
    const channelsPageSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'pages', 'ChannelsPage.tsx'),
      'utf8'
    )

    expect(channelsPageSource).toContain('修复飞书插件')
    expect(channelsPageSource).toContain('window.api.repairManagedChannelPlugin')
    expect(channelsPageSource).toContain('window.api.getManagedChannelPluginStatus')
    expect(channelsPageSource).toContain('repairingPluginChannelId === channel.channelId')
  })

  it('shows the shared feishu plugin repair action only for feishu bot rows', () => {
    expect(
      shouldShowFeishuPluginRepairAction({
        channelId: 'feishu',
        pairingAccountId: 'default',
      })
    ).toBe(true)

    expect(
      shouldShowFeishuPluginRepairAction({
        channelId: 'wecom',
        pairingAccountId: 'default',
      })
    ).toBe(false)

    expect(
      shouldShowFeishuPluginRepairAction({
        channelId: 'feishu',
        pairingAccountId: undefined,
      })
    ).toBe(false)
  })

  it('does not reuse cached model options when the feishu modal requests the full models-page scope', () => {
    expect(shouldReuseModelOptionsCache()).toBe(true)
    expect(shouldReuseModelOptionsCache({ mode: 'available' })).toBe(true)
    expect(shouldReuseModelOptionsCache({ mode: 'all' })).toBe(false)
    expect(shouldReuseModelOptionsCache({ forceRefresh: true })).toBe(false)
  })

  it('reuses the shared model catalog path for feishu model config instead of forcing a refresh', () => {
    const channelsPageSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'pages', 'ChannelsPage.tsx'),
      'utf8'
    )

    expect(channelsPageSource).toMatch(/loadModelOptions\(\{[\s\S]*statusData,[\s\S]*preferredModelKey:\s*nextRuntimeModel/s)
    expect(channelsPageSource).not.toMatch(/loadModelOptions\(\{\s*forceRefresh:\s*true/s)
  })

  it('loads env and config snapshots so the feishu model modal can reuse the models page full catalog scope', () => {
    const channelsPageSource = fs.readFileSync(
      path.join(process.cwd(), 'src', 'pages', 'ChannelsPage.tsx'),
      'utf8'
    )

    expect(channelsPageSource).toContain('window.api.readEnvFile()')
    expect(channelsPageSource).toContain("mode: 'all'")
    expect(channelsPageSource).toContain('envVars')
    expect(channelsPageSource).toContain('configData')
  })
})
