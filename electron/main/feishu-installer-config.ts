const BUILTIN_FEISHU_PLUGIN_ID = 'feishu'
const LEGACY_FEISHU_PLUGIN_ID = 'feishu-openclaw-plugin'
const FEISHU_OFFICIAL_PLUGIN_ID = 'openclaw-lark'
const FEISHU_OFFICIAL_PLUGIN_SPEC = '@larksuite/openclaw-lark'

function cloneConfig(config: Record<string, any> | null): Record<string, any> {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return {}
  return JSON.parse(JSON.stringify(config)) as Record<string, any>
}

function hasOwnRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export {
  FEISHU_OFFICIAL_PLUGIN_ID,
  FEISHU_OFFICIAL_PLUGIN_SPEC,
}

export function prepareFeishuInstallerConfig(
  config: Record<string, any> | null,
  options: {
    pluginInstalledOnDisk: boolean
    installPath?: string
  }
): { config: Record<string, any>; changed: boolean } {
  const next = cloneConfig(config)
  next.plugins = hasOwnRecord(next.plugins) ? next.plugins : {}
  const plugins = next.plugins as Record<string, any>
  let changed = false

  if (!hasOwnRecord(plugins.entries)) {
    plugins.entries = {}
    changed = true
  }

  const currentBuiltInEntry = plugins.entries[BUILTIN_FEISHU_PLUGIN_ID]
  const normalizedBuiltInEntry = hasOwnRecord(currentBuiltInEntry)
    ? {
        ...currentBuiltInEntry,
        enabled: false,
      }
    : { enabled: false }
  if (
    !hasOwnRecord(currentBuiltInEntry) ||
    JSON.stringify(currentBuiltInEntry) !== JSON.stringify(normalizedBuiltInEntry)
  ) {
    plugins.entries[BUILTIN_FEISHU_PLUGIN_ID] = normalizedBuiltInEntry
    changed = true
  }

  if (Array.isArray(plugins.allow)) {
    const filtered = plugins.allow.filter(
      (item: unknown) => ![BUILTIN_FEISHU_PLUGIN_ID, FEISHU_OFFICIAL_PLUGIN_ID].includes(String(item || '').trim())
    )
    if (filtered.length !== plugins.allow.length) {
      plugins.allow = filtered
      changed = true
    }
  }

  if (plugins.entries && typeof plugins.entries === 'object' && !Array.isArray(plugins.entries)) {
    if (plugins.entries[LEGACY_FEISHU_PLUGIN_ID] !== undefined) {
      delete plugins.entries[LEGACY_FEISHU_PLUGIN_ID]
      changed = true
    }
    if (plugins.entries[FEISHU_OFFICIAL_PLUGIN_ID] !== undefined) {
      delete plugins.entries[FEISHU_OFFICIAL_PLUGIN_ID]
      changed = true
    }
  }

  const installPath = String(options.installPath || '').trim()
  const installs =
    plugins.installs && typeof plugins.installs === 'object' && !Array.isArray(plugins.installs)
      ? plugins.installs
      : (plugins.installs = {})

  for (const legacyId of [BUILTIN_FEISHU_PLUGIN_ID, LEGACY_FEISHU_PLUGIN_ID]) {
    if (installs[legacyId] !== undefined) {
      delete installs[legacyId]
      changed = true
    }
  }

  if (options.pluginInstalledOnDisk) {
    const existingInstall =
      installs[FEISHU_OFFICIAL_PLUGIN_ID] &&
      typeof installs[FEISHU_OFFICIAL_PLUGIN_ID] === 'object' &&
      !Array.isArray(installs[FEISHU_OFFICIAL_PLUGIN_ID])
        ? installs[FEISHU_OFFICIAL_PLUGIN_ID]
        : null
    const existingSource = String(existingInstall?.source || '').trim()
    const existingSpec = String(existingInstall?.spec || '').trim()
    const existingInstallPath = String(existingInstall?.installPath || '').trim()

    if (!existingSource || !existingSpec || !existingInstallPath) {
      installs[FEISHU_OFFICIAL_PLUGIN_ID] = {
        ...(existingInstall || {}),
        source: existingSource || 'npm',
        spec: existingSpec || FEISHU_OFFICIAL_PLUGIN_SPEC,
        ...(installPath ? { installPath: existingInstallPath || installPath } : {}),
      }
      changed = true
    }
  } else if (installs[FEISHU_OFFICIAL_PLUGIN_ID] !== undefined) {
    delete installs[FEISHU_OFFICIAL_PLUGIN_ID]
    changed = true
  }

  return {
    config: next,
    changed,
  }
}
