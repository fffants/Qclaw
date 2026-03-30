import { listManagedChannelPluginRecords } from '../../src/shared/managed-channel-plugin-registry'

export interface PruneStalePluginEntriesResult {
  changed: boolean
  removedPluginIds: string[]
}

export interface RepairStalePluginConfigFromCommandResult {
  stalePluginIds: string[]
  changed: boolean
  removedPluginIds: string[]
}

interface StalePluginEntryOptions {
  readConfig?: () => Promise<Record<string, any> | null>
  writeConfig?: (config: Record<string, any>) => Promise<void>
  pruneManagedChannels?: boolean
}

interface RepairStalePluginConfigFromCommandResultOptions {
  pruneStalePluginEntries?: (
    pluginIds: string[]
  ) => Promise<Awaited<ReturnType<typeof pruneStalePluginConfigEntries>>>
}

const STALE_PLUGIN_ENTRY_REGEX =
  /plugins\.(?:entries\.([A-Za-z0-9._-]+)|allow): plugin (?:not found|removed): ([A-Za-z0-9._-]+).*?\(stale config entry ignored; remove it from plugins config\)/gi

const CONFIG_WARNING_LINE_REGEX =
  /^(config warnings:?|- plugins\.(?:entries\.[^:]+|allow): plugin (?:not found|removed): .*stale config entry ignored.*)$/i

const STALE_PLUGIN_CHANNEL_IDS: Record<string, string[]> = Object.fromEntries(
  listManagedChannelPluginRecords().map((record) => [record.pluginId, record.cleanupChannelIds])
)

async function defaultReadConfig(): Promise<Record<string, any> | null> {
  const cli = await import('./cli')
  return cli.readConfig()
}

async function defaultWriteConfig(config: Record<string, any>): Promise<void> {
  const guard = await import('./openclaw-config-guard')
  const writeResult = await guard.guardedWriteConfig({
    config,
    reason: 'unknown',
  })
  if (!writeResult.ok) {
    throw new Error(writeResult.message || '写入配置失败')
  }
}

export function extractStalePluginConfigEntryIds(output: string): string[] {
  const text = String(output || '')
  const seen = new Set<string>()
  const ids: string[] = []

  for (const match of text.matchAll(STALE_PLUGIN_ENTRY_REGEX)) {
    const pluginId = String(match[1] || match[2] || '').trim()
    if (!pluginId || seen.has(pluginId)) continue
    seen.add(pluginId)
    ids.push(pluginId)
  }

  return ids
}

export function isConfigWarningLine(line: string): boolean {
  return CONFIG_WARNING_LINE_REGEX.test(String(line || '').trim())
}

export async function pruneStalePluginConfigEntries(
  pluginIds: string[],
  options: StalePluginEntryOptions = {}
): Promise<PruneStalePluginEntriesResult> {
  const uniquePluginIds = [...new Set(pluginIds.map((item) => String(item || '').trim()).filter(Boolean))]
  if (uniquePluginIds.length === 0) {
    return {
      changed: false,
      removedPluginIds: [],
    }
  }

  const readConfig = options.readConfig || defaultReadConfig
  const writeConfig = options.writeConfig || defaultWriteConfig
  const pruneManagedChannels = options.pruneManagedChannels === true
  const config = await readConfig()

  if (!config || typeof config !== 'object') {
    return {
      changed: false,
      removedPluginIds: [],
    }
  }

  const plugins = config.plugins
  const entries = plugins && typeof plugins === 'object' && plugins.entries && typeof plugins.entries === 'object'
    ? plugins.entries
    : null
  const allow = plugins && typeof plugins === 'object' && Array.isArray(plugins.allow) ? plugins.allow : null
  const installs = plugins && typeof plugins === 'object' && plugins.installs && typeof plugins.installs === 'object'
    ? plugins.installs
    : null
  const channels = config.channels && typeof config.channels === 'object' ? config.channels : null

  const nextEntries = entries ? { ...entries } : null
  const nextAllow = allow ? allow.filter((pluginId: unknown) => !uniquePluginIds.includes(String(pluginId || '').trim())) : null
  const nextInstalls = installs ? { ...installs } : null
  const nextChannels = channels ? { ...channels } : null
  const associatedChannelIds = pruneManagedChannels
    ? [...new Set(
        uniquePluginIds.flatMap((pluginId) => {
          const mappedIds = STALE_PLUGIN_CHANNEL_IDS[pluginId] || []
          return [pluginId, ...mappedIds].map((item) => String(item || '').trim()).filter(Boolean)
        })
      )]
    : []

  const removedFromEntries = uniquePluginIds.filter((pluginId) => nextEntries && Object.prototype.hasOwnProperty.call(nextEntries, pluginId))
  const removedFromAllow = allow
    ? allow
        .map((pluginId: unknown) => String(pluginId || '').trim())
        .filter((pluginId: string) => uniquePluginIds.includes(pluginId))
    : []
  const removedFromInstalls = uniquePluginIds.filter((pluginId) => nextInstalls && Object.prototype.hasOwnProperty.call(nextInstalls, pluginId))
  const removedFromChannels = associatedChannelIds.filter(
    (channelId) => nextChannels && Object.prototype.hasOwnProperty.call(nextChannels, channelId)
  )
  const removedPluginIdSet = new Set([...removedFromEntries, ...removedFromAllow, ...removedFromInstalls])
  const removedPluginIds = uniquePluginIds.filter((pluginId) => removedPluginIdSet.has(pluginId))
  const changed = removedPluginIds.length > 0 || removedFromChannels.length > 0
  if (!changed) {
    return {
      changed: false,
      removedPluginIds: [],
    }
  }

  for (const pluginId of removedFromEntries) {
    delete nextEntries![pluginId]
  }
  for (const pluginId of removedFromInstalls) {
    delete nextInstalls![pluginId]
  }
  for (const channelId of removedFromChannels) {
    delete nextChannels![channelId]
  }

  const nextConfig = {
    ...config,
    ...(nextChannels ? { channels: nextChannels } : {}),
    ...(plugins && typeof plugins === 'object'
      ? {
          plugins: {
            ...plugins,
            ...(nextEntries ? { entries: nextEntries } : {}),
            ...(nextAllow ? { allow: nextAllow } : {}),
            ...(nextInstalls ? { installs: nextInstalls } : {}),
          },
        }
      : {}),
  }

  await writeConfig(nextConfig)

  return {
    changed: true,
    removedPluginIds,
  }
}

export async function repairStalePluginConfigFromCommandResult(
  result: {
    stdout?: string
    stderr?: string
  },
  options: RepairStalePluginConfigFromCommandResultOptions = {}
): Promise<RepairStalePluginConfigFromCommandResult> {
  const stalePluginIds = extractStalePluginConfigEntryIds(`${result.stderr || ''}\n${result.stdout || ''}`)
  if (stalePluginIds.length === 0) {
    return {
      stalePluginIds: [],
      changed: false,
      removedPluginIds: [],
    }
  }

  const pruneResult = await (options.pruneStalePluginEntries || pruneStalePluginConfigEntries)(stalePluginIds)
  return {
    stalePluginIds,
    changed: pruneResult.changed,
    removedPluginIds: pruneResult.removedPluginIds,
  }
}
