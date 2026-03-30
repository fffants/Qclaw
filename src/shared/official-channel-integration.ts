import type {
  ManagedChannelPluginStatusStage,
  ManagedChannelPluginStatusStageState,
  ManagedChannelPluginStatusView,
  ManagedChannelSetupEvidence,
  ManagedChannelSetupEvidenceSource,
} from './managed-channel-plugin-lifecycle'

export type OfficialChannelAdapterId = 'feishu' | 'dingtalk'

export type OfficialChannelSetupEvidenceSource = ManagedChannelSetupEvidenceSource
export type OfficialChannelSetupEvidence = ManagedChannelSetupEvidence

export interface OfficialChannelGatewayResult {
  ok: boolean
  running: boolean
  requestedAction: 'reload-after-setup' | 'reload-after-repair'
  summary: string
  stateCode?: string
  detail?: string
}

export interface OfficialChannelActionResult {
  ok: boolean
  channelId: string
  pluginId: string
  summary: string
  installedThisRun: boolean
  gatewayResult: OfficialChannelGatewayResult | null
  evidence: OfficialChannelSetupEvidence[]
  stdout: string
  stderr: string
  code: number | null
  message?: string
}

export type OfficialChannelStatusStageId = ManagedChannelPluginStatusStage['id']
export type OfficialChannelStatusStageState = ManagedChannelPluginStatusStageState
export type OfficialChannelStatusStage = ManagedChannelPluginStatusStage
export type OfficialChannelStatusView = ManagedChannelPluginStatusView
