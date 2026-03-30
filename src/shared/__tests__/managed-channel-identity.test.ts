import { describe, expect, it } from 'vitest'
import { resolveManagedChannelIdentity } from '../managed-channel-identity'

describe('resolveManagedChannelIdentity', () => {
  it('normalizes DingTalk config identity through the shared managed registry', () => {
    expect(
      resolveManagedChannelIdentity({
        configChannelId: 'dingtalk-connector',
        platform: 'dingtalk',
      })
    ).toEqual({
      channelId: 'dingtalk',
      configChannelId: 'dingtalk-connector',
      platform: 'dingtalk',
      pluginId: 'dingtalk-connector',
      managementKind: 'official-managed',
      sourceOfTruth: 'qclaw-shared-registry',
      officialAdapterId: 'dingtalk',
    })
  })

  it('marks managed channels without an official adapter surface as official-managed only', () => {
    expect(
      resolveManagedChannelIdentity({
        configChannelId: 'qqbot',
        platform: 'qqbot',
      })
    ).toEqual({
      channelId: 'qqbot',
      configChannelId: 'qqbot',
      platform: 'qqbot',
      pluginId: 'openclaw-qqbot',
      managementKind: 'official-managed',
      sourceOfTruth: 'qclaw-shared-registry',
    })
  })

  it('falls back to config-derived identity for unmanaged channels', () => {
    expect(
      resolveManagedChannelIdentity({
        configChannelId: 'custom-channel',
        platform: 'custom-platform',
      })
    ).toEqual({
      channelId: 'custom-platform',
      configChannelId: 'custom-channel',
      platform: 'custom-platform',
      managementKind: 'unmanaged',
      sourceOfTruth: 'config',
    })
  })
})
