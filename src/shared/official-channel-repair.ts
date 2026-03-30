import type {
  OfficialChannelActionResult,
  OfficialChannelAdapterId,
  OfficialChannelStatusView,
} from './official-channel-integration'

export interface OfficialChannelRepairOutcome {
  ok: boolean
  summary: string
  log: string
}

interface OfficialChannelRepairApi {
  getOfficialChannelStatus: (channelId: OfficialChannelAdapterId) => Promise<OfficialChannelStatusView | null>
  repairOfficialChannel: (channelId: OfficialChannelAdapterId) => Promise<OfficialChannelActionResult>
}

export function buildOfficialChannelRepairOutcome(
  result: OfficialChannelActionResult
): OfficialChannelRepairOutcome {
  const lines = result.evidence.map((item) => {
    const isGatewayFailure = item.source === 'gateway' && result.gatewayResult?.running !== true
    return `${isGatewayFailure ? '⚠️' : '✅'} ${item.message}`
  })

  if (!result.ok) {
    lines.push(`❌ ${result.message || result.summary}`)
  }

  return {
    ok: result.ok,
    summary: result.summary,
    log: lines.join('\n') || (result.ok ? `✅ ${result.summary}` : `❌ ${result.summary}`),
  }
}

export async function runOfficialChannelRepairFlow(
  api: OfficialChannelRepairApi,
  channelId: OfficialChannelAdapterId
): Promise<OfficialChannelRepairOutcome> {
  const currentStatus = await api.getOfficialChannelStatus(channelId).catch(() => null)
  const result = await api.repairOfficialChannel(channelId)
  const outcome = buildOfficialChannelRepairOutcome(result)

  return {
    ...outcome,
    log: [
      currentStatus ? `🔎 ${currentStatus.summary}` : '',
      outcome.log,
    ].filter(Boolean).join('\n'),
  }
}
