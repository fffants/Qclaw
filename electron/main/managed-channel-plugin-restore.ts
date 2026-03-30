import {
  createManagedChannelCapabilitySnapshot,
  createManagedChannelRuntimeSnapshot,
  listManagedChannelLifecycleSpecs,
  type ManagedChannelPluginInspectResult,
  type ManagedChannelPluginRepairResult,
} from '../../src/shared/managed-channel-plugin-lifecycle'

interface RepairResultLike {
  quarantinedPluginIds: string[]
  prunedPluginIds: string[]
}

interface RestoreManagedChannelPluginDependencies {
  inspectManagedChannelPlugin: (channelId: string) => Promise<ManagedChannelPluginInspectResult>
  repairManagedChannelPlugin: (channelId: string) => Promise<ManagedChannelPluginRepairResult>
}

export interface RestoreConfiguredManagedChannelPluginsParams {
  referenceConfig: Record<string, any> | null | undefined
  repairResult: RepairResultLike
  dependencies: RestoreManagedChannelPluginDependencies
}

export interface RestoreConfiguredManagedChannelPluginsResult {
  ok: boolean
  restoredChannelIds: string[]
  gatewayReloaded: boolean
  summary: string
  stderr: string
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function uniquePluginIds(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
}

function scopeWasAffected(
  repairResult: RepairResultLike,
  pluginIds: string[]
): boolean {
  const affected = new Set(
    uniquePluginIds([
      ...repairResult.quarantinedPluginIds,
      ...repairResult.prunedPluginIds,
    ])
  )
  return uniquePluginIds(pluginIds).some((pluginId) => affected.has(pluginId))
}

function hasConfiguredManagedChannel(
  spec: ReturnType<typeof listManagedChannelLifecycleSpecs>[number],
  config: Record<string, any> | null | undefined
): boolean {
  return spec.detectConfigured({
    referenceConfig: config,
    currentConfig: config,
    runtime: createManagedChannelRuntimeSnapshot(),
    capabilities: createManagedChannelCapabilitySnapshot({
      supportsBackgroundRestore: spec.supportsBackgroundRestore,
      supportsInteractiveRepair: spec.supportsInteractiveRepairUi,
    }),
  })
}

function shouldSkipRestoreForInspection(
  inspection: ManagedChannelPluginInspectResult | null | undefined
): boolean {
  return inspection?.kind === 'ok' || inspection?.kind === 'plugin-ready-channel-not-ready'
}

function getRepairFailureSummary(result: Exclude<ManagedChannelPluginRepairResult, { kind: 'ok' }>): string {
  if (result.kind === 'gateway-reload-failed') return result.reloadReason
  if (result.kind === 'install-failed' || result.kind === 'repair-failed') return result.error
  if (result.kind === 'config-sync-required') return result.reason
  if (result.kind === 'plugin-ready-channel-not-ready') return result.blockingReason
  if (result.kind === 'capability-blocked') {
    return result.missingCapabilities.join('；') || result.status.summary
  }
  if (result.kind === 'quarantine-failed') {
    return result.status.summary || `插件隔离失败：${result.failureKind}`
  }
  return result.reason
}

function buildResultSummary(restoredChannelIds: string[], failureCount: number): string {
  if (restoredChannelIds.length === 0 && failureCount === 0) {
    return '未发现需要恢复的已配置官方渠道插件。'
  }
  if (failureCount === 0) {
    return `已自动恢复 ${restoredChannelIds.length} 个已配置官方渠道插件。`
  }
  if (restoredChannelIds.length > 0) {
    return `已自动恢复 ${restoredChannelIds.length} 个已配置官方渠道插件，但仍有 ${failureCount} 个渠道恢复失败。`
  }
  return '已检测到需要恢复的已配置官方渠道插件，但自动恢复失败。'
}

export async function restoreConfiguredManagedChannelPlugins(
  params: RestoreConfiguredManagedChannelPluginsParams
): Promise<RestoreConfiguredManagedChannelPluginsResult> {
  const restoredChannelIds: string[] = []
  const failureMessages: string[] = []
  let gatewayReloaded = false

  for (const spec of listManagedChannelLifecycleSpecs()) {
    if (!spec.supportsBackgroundRestore) {
      continue
    }

    if (!hasConfiguredManagedChannel(spec, params.referenceConfig)) {
      continue
    }

    const scopedPluginIds = uniquePluginIds([spec.canonicalPluginId, ...spec.cleanupPluginIds])
    const selectedScopeAffected = scopeWasAffected(params.repairResult, scopedPluginIds)

    if (!selectedScopeAffected) {
      const inspection = await params.dependencies.inspectManagedChannelPlugin(spec.channelId).catch(() => null)
      if (shouldSkipRestoreForInspection(inspection)) {
        continue
      }
    }

    const repairResult = await params.dependencies.repairManagedChannelPlugin(spec.channelId)
    if (repairResult.kind !== 'ok') {
      failureMessages.push(getRepairFailureSummary(repairResult))
      continue
    }

    restoredChannelIds.push(spec.channelId)
    if (spec.installStrategy !== 'official-adapter') {
      gatewayReloaded = true
    }
  }

  return {
    ok: failureMessages.length === 0,
    restoredChannelIds,
    gatewayReloaded,
    summary: buildResultSummary(restoredChannelIds, failureMessages.length),
    stderr: failureMessages.join('\n\n'),
  }
}
