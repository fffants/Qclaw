import type { CliResult } from './cli'
import type { OpenClawCapabilities } from './openclaw-capabilities'
import { buildPluginEnableCommand } from './openclaw-command-builder'
import {
  extractStalePluginConfigEntryIds,
  pruneStalePluginConfigEntries,
} from './openclaw-config-warnings'
import type { OpenClawAuthRegistry } from './openclaw-auth-registry'
import { MAIN_RUNTIME_POLICY } from './runtime-policy'

const PLUGIN_TIMEOUT_MS = MAIN_RUNTIME_POLICY.auth.pluginEnableTimeoutMs

export interface BundledAuthPluginEnableFailure {
  pluginId: string
  message: string
}

export interface BundledAuthPluginEnableResult {
  attemptedCommands: string[][]
  enabledPluginIds: string[]
  failedPluginIds: BundledAuthPluginEnableFailure[]
  skippedPluginIds: string[]
}

export function collectBundledAuthPluginIds(registry: OpenClawAuthRegistry): string[] {
  if (!registry?.providers?.length) return []

  const seen = new Set<string>()
  const pluginIds: string[] = []
  for (const provider of registry.providers) {
    for (const method of provider.methods || []) {
      const pluginId = String(method.route?.pluginId || '').trim()
      if (!pluginId || seen.has(pluginId)) continue
      seen.add(pluginId)
      pluginIds.push(pluginId)
    }
  }
  return pluginIds
}

export function pluginEnableLooksSuccessful(result: CliResult): boolean {
  if (result.ok) return true
  const combined = `${result.stdout}\n${result.stderr}`.toLowerCase()
  return combined.includes('already enabled') || combined.includes('enabled plugin')
}

export async function enableBundledAuthPlugins(params: {
  registry: OpenClawAuthRegistry
  capabilities: OpenClawCapabilities
  runCommand: (args: string[], timeout?: number) => Promise<CliResult>
  pruneStalePluginEntries?: (
    pluginIds: string[]
  ) => Promise<Awaited<ReturnType<typeof pruneStalePluginConfigEntries>>>
}): Promise<BundledAuthPluginEnableResult> {
  const pluginIds = collectBundledAuthPluginIds(params.registry)
  const attemptedCommands: string[][] = []
  const enabledPluginIds: string[] = []
  const failedPluginIds: BundledAuthPluginEnableFailure[] = []
  const stalePluginIds = new Set<string>()

  if (pluginIds.length === 0) {
    return {
      attemptedCommands,
      enabledPluginIds,
      failedPluginIds,
      skippedPluginIds: [],
    }
  }

  if (!params.capabilities.supports.pluginsEnable) {
    return {
      attemptedCommands,
      enabledPluginIds,
      failedPluginIds,
      skippedPluginIds: [...pluginIds],
    }
  }

  for (const pluginId of pluginIds) {
    const buildResult = buildPluginEnableCommand(pluginId, params.capabilities)
    if (!buildResult.ok) {
      failedPluginIds.push({
        pluginId,
        message: buildResult.message,
      })
      continue
    }

    attemptedCommands.push(buildResult.command)
    const result = await params.runCommand(buildResult.command, PLUGIN_TIMEOUT_MS)
    for (const pluginId of extractStalePluginConfigEntryIds(`${result.stderr || ''}\n${result.stdout || ''}`)) {
      stalePluginIds.add(pluginId)
    }
    if (pluginEnableLooksSuccessful(result)) {
      enabledPluginIds.push(pluginId)
      continue
    }

    failedPluginIds.push({
      pluginId,
      message: String(result.stderr || result.stdout || 'Plugin enable failed').trim(),
    })
  }

  if (stalePluginIds.size > 0) {
    await (params.pruneStalePluginEntries || pruneStalePluginConfigEntries)([...stalePluginIds])
  }

  return {
    attemptedCommands,
    enabledPluginIds,
    failedPluginIds,
    skippedPluginIds: [],
  }
}
