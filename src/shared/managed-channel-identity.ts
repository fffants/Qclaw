import type { OfficialChannelAdapterId } from './official-channel-integration'
import {
  getManagedChannelPluginByChannelId,
  getManagedChannelPluginByPluginId,
} from './managed-channel-plugin-registry'

export type ManagedChannelKind = 'official-managed' | 'unmanaged'
export type ManagedChannelSourceOfTruth = 'qclaw-shared-registry' | 'config'

export interface ManagedChannelIdentity {
  channelId: string
  configChannelId: string
  platform: string
  pluginId?: string
  managementKind: ManagedChannelKind
  sourceOfTruth: ManagedChannelSourceOfTruth
  officialAdapterId?: OfficialChannelAdapterId
}

function normalizeId(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function toOfficialAdapterId(channelId: string): OfficialChannelAdapterId | undefined {
  if (channelId === 'feishu' || channelId === 'dingtalk') {
    return channelId
  }
  return undefined
}

export function resolveManagedChannelIdentity(params: {
  configChannelId: string
  platform?: string
}): ManagedChannelIdentity {
  const configChannelId = normalizeId(params.configChannelId)
  const platform = normalizeId(params.platform) || configChannelId
  const record =
    getManagedChannelPluginByChannelId(configChannelId)
    || getManagedChannelPluginByChannelId(platform)
    || getManagedChannelPluginByPluginId(configChannelId)

  if (!record) {
    return {
      channelId: platform || configChannelId,
      configChannelId,
      platform: platform || configChannelId,
      managementKind: 'unmanaged',
      sourceOfTruth: 'config',
    }
  }

  const officialAdapterId = toOfficialAdapterId(record.channelId)

  return {
    channelId: record.channelId,
    configChannelId,
    platform: platform || record.channelId,
    pluginId: record.pluginId,
    managementKind: 'official-managed',
    sourceOfTruth: 'qclaw-shared-registry',
    ...(officialAdapterId ? { officialAdapterId } : {}),
  }
}
