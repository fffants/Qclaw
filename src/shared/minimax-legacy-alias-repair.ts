import {
  areRuntimeModelsEquivalent,
  findEquivalentRuntimeModelKey,
  resolveRuntimeWritableModelKey,
} from '../lib/model-runtime-resolution'
import { extractConfiguredDefaultModel } from './model-config-gateway'
import {
  getUpstreamModelStatusLike,
  readOpenClawUpstreamModelState,
  type RendererUpstreamModelStateResult,
} from './upstream-model-state'

interface UpstreamModelWriteLikeResult {
  ok: boolean
  wrote?: boolean
  gatewayReloaded?: boolean
  source?: string
  fallbackUsed?: boolean
  fallbackReason?: string
  message?: string
}

export interface LegacyMiniMaxAliasRepairResult {
  attempted: boolean
  repaired: boolean
  defaultRepaired: boolean
  repairedAgentIds: string[]
  reason:
    | 'missing-config'
    | 'upstream-unavailable'
    | 'upstream-status-missing'
    | 'not-minimax-upstream'
    | 'nothing-to-repair'
    | 'repaired'
    | 'partial-failure'
  message?: string
}

function isLegacyMiniMaxAliasModel(model: unknown): boolean {
  return String(model || '').trim().toLowerCase().startsWith('minimax/')
}

function isMiniMaxPortalModel(model: unknown): boolean {
  return String(model || '').trim().toLowerCase().startsWith('minimax-portal/')
}

function mapLegacyMiniMaxAliasToPortalModel(model: unknown): string {
  const normalized = String(model || '').trim()
  if (!isLegacyMiniMaxAliasModel(normalized)) return ''
  const modelId = normalized.slice('minimax/'.length).trim()
  if (!modelId) return ''
  return `minimax-portal/${modelId}`
}

function hasMiniMaxPortalProviderAuth(upstreamStatus: Record<string, any> | null | undefined): boolean {
  const providerGroups = [
    upstreamStatus?.auth?.providers,
    upstreamStatus?.auth?.oauth?.providers,
  ]

  for (const group of providerGroups) {
    if (!Array.isArray(group)) continue
    for (const entry of group) {
      const provider = String(entry?.provider || '').trim().toLowerCase()
      const status = String(entry?.status || '').trim().toLowerCase()
      if (provider !== 'minimax-portal') continue
      if (!status || status === 'ok' || status === 'configured' || status === 'ready') {
        return true
      }
    }
  }

  return false
}

function hasMiniMaxPortalRuntimeCandidates(upstreamStatus: Record<string, any> | null | undefined): boolean {
  const candidateLists = [
    upstreamStatus?.allowed,
    upstreamStatus?.fallbacks,
    upstreamStatus?.agents?.defaults?.model?.fallbacks,
    upstreamStatus?.agents?.defaults?.model?.imageFallbacks,
    upstreamStatus?.agents?.defaults?.model?.image_fallbacks,
  ]

  for (const list of candidateLists) {
    if (!Array.isArray(list)) continue
    if (list.some((entry) => isMiniMaxPortalModel(entry))) {
      return true
    }
  }

  const aliasValues = upstreamStatus?.aliases
  if (Array.isArray(aliasValues)) {
    return aliasValues.some((entry) => isMiniMaxPortalModel(entry?.model ?? entry?.target))
  }
  if (aliasValues && typeof aliasValues === 'object') {
    return Object.values(aliasValues).some((entry) => isMiniMaxPortalModel(entry))
  }

  return false
}

function collectMiniMaxPortalRuntimeCandidates(upstreamStatus: Record<string, any> | null | undefined): string[] {
  const candidates: string[] = []
  const push = (value: unknown) => {
    const model = String(value || '').trim()
    if (isMiniMaxPortalModel(model)) {
      candidates.push(model)
    }
  }
  const pushList = (value: unknown) => {
    if (!Array.isArray(value)) return
    for (const entry of value) {
      push(entry)
    }
  }

  push(upstreamStatus?.defaultModel)
  push(upstreamStatus?.resolvedDefault)
  push(upstreamStatus?.model)
  push(upstreamStatus?.agent?.model)
  push(upstreamStatus?.agents?.defaults?.model?.primary)
  pushList(upstreamStatus?.allowed)
  pushList(upstreamStatus?.fallbacks)
  pushList(upstreamStatus?.agents?.defaults?.model?.fallbacks)
  pushList(upstreamStatus?.agents?.defaults?.model?.imageFallbacks)
  pushList(upstreamStatus?.agents?.defaults?.model?.image_fallbacks)

  const aliasValues = upstreamStatus?.aliases
  if (Array.isArray(aliasValues)) {
    for (const entry of aliasValues) {
      push(entry?.model ?? entry?.target)
    }
  } else if (aliasValues && typeof aliasValues === 'object') {
    for (const entry of Object.values(aliasValues)) {
      push(entry)
    }
  }

  return Array.from(new Set(candidates))
}

function hasMiniMaxPortalUpstreamTruth(upstreamStatus: Record<string, any> | null | undefined): boolean {
  const upstreamDefaultModel = String(upstreamStatus?.defaultModel || upstreamStatus?.model || '').trim()
  if (isMiniMaxPortalModel(upstreamDefaultModel)) return true
  if (hasMiniMaxPortalProviderAuth(upstreamStatus)) return true
  return hasMiniMaxPortalRuntimeCandidates(upstreamStatus)
}

function resolveLegacyMiniMaxTargetModel(
  currentModel: unknown,
  upstreamStatus: Record<string, any> | null | undefined
): string {
  const model = String(currentModel || '').trim()
  if (!isLegacyMiniMaxAliasModel(model)) return ''
  const targetModel = resolveRuntimeWritableModelKey(model, upstreamStatus)
  const portalTargetModel = isMiniMaxPortalModel(targetModel)
    ? targetModel
    : findEquivalentRuntimeModelKey(model, collectMiniMaxPortalRuntimeCandidates(upstreamStatus))
      || (hasMiniMaxPortalProviderAuth(upstreamStatus) ? mapLegacyMiniMaxAliasToPortalModel(model) : '')
  const resolvedTargetModel = String(portalTargetModel || '').trim()
  if (!resolvedTargetModel) return ''
  if (!isMiniMaxPortalModel(resolvedTargetModel)) return ''
  if (!areRuntimeModelsEquivalent(model, resolvedTargetModel)) return ''
  if (resolvedTargetModel === model) return ''
  return resolvedTargetModel
}

export async function repairLegacyMiniMaxAliasConfigAfterOAuth(params: {
  readConfig?: () => Promise<Record<string, any> | null>
  readUpstreamState?: () => Promise<RendererUpstreamModelStateResult>
  applyUpstreamModelWrite: (request: {
    kind: 'default' | 'agent-primary'
    model: string
    agentId?: string
  }) => Promise<UpstreamModelWriteLikeResult | null>
}): Promise<LegacyMiniMaxAliasRepairResult> {
  let config: Record<string, any> | null = null
  try {
    config = await (params.readConfig ? params.readConfig() : window.api.readConfig())
  } catch {
    config = null
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return {
      attempted: false,
      repaired: false,
      defaultRepaired: false,
      repairedAgentIds: [],
      reason: 'missing-config',
    }
  }

  const upstreamState = await readOpenClawUpstreamModelState(
    params.readUpstreamState || (() => window.api.getModelUpstreamState())
  )
  if (!upstreamState.ok) {
    return {
      attempted: false,
      repaired: false,
      defaultRepaired: false,
      repairedAgentIds: [],
      reason: 'upstream-unavailable',
      message: upstreamState.fallbackReason,
    }
  }

  const upstreamStatus = getUpstreamModelStatusLike(upstreamState)
  if (!upstreamStatus) {
    return {
      attempted: false,
      repaired: false,
      defaultRepaired: false,
      repairedAgentIds: [],
      reason: 'upstream-status-missing',
    }
  }

  if (!hasMiniMaxPortalUpstreamTruth(upstreamStatus)) {
    return {
      attempted: false,
      repaired: false,
      defaultRepaired: false,
      repairedAgentIds: [],
      reason: 'not-minimax-upstream',
    }
  }

  const defaultTarget = resolveLegacyMiniMaxTargetModel(extractConfiguredDefaultModel(config), upstreamStatus)
  const agentRepairs = (Array.isArray(config?.agents?.list) ? config.agents.list : [])
    .map((agent: any) => {
      const agentId = String(agent?.id || '').trim()
      const targetModel = resolveLegacyMiniMaxTargetModel(agent?.model, upstreamStatus)
      if (!agentId || !targetModel) return null
      return {
        agentId,
        targetModel,
      }
    })
    .filter(Boolean) as Array<{
      agentId: string
      targetModel: string
    }>

  if (!defaultTarget && agentRepairs.length === 0) {
    return {
      attempted: false,
      repaired: false,
      defaultRepaired: false,
      repairedAgentIds: [],
      reason: 'nothing-to-repair',
    }
  }

  let defaultRepaired = false
  const repairedAgentIds: string[] = []
  const failures: string[] = []

  if (defaultTarget) {
    const result = await params.applyUpstreamModelWrite({
      kind: 'default',
      model: defaultTarget,
    }).catch(() => null)
    if (result?.ok) {
      defaultRepaired = true
    } else {
      failures.push(result?.message || result?.fallbackReason || 'default-repair-failed')
    }
  }

  for (const agentRepair of agentRepairs) {
    const result = await params.applyUpstreamModelWrite({
      kind: 'agent-primary',
      agentId: agentRepair.agentId,
      model: agentRepair.targetModel,
    }).catch(() => null)
    if (result?.ok) {
      repairedAgentIds.push(agentRepair.agentId)
    } else {
      failures.push(`${agentRepair.agentId}:${result?.message || result?.fallbackReason || 'agent-repair-failed'}`)
    }
  }

  return {
    attempted: true,
    repaired: defaultRepaired || repairedAgentIds.length > 0,
    defaultRepaired,
    repairedAgentIds,
    reason: failures.length > 0 ? 'partial-failure' : 'repaired',
    ...(failures.length > 0 ? { message: failures.join('；') } : {}),
  }
}
