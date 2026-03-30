export type GatewayApplyAction = 'none' | 'hot-reload' | 'restart'

export interface GatewayApplyChangeSet {
  changedJsonPaths: string[]
  changedEnvKeys?: string[]
}

export interface GatewayApplyDecision {
  action: GatewayApplyAction
  reason: string
  matched: string[]
}

const RESTART_PATH_PREFIXES = [
  '$.gateway.mode',
  '$.gateway.port',
  '$.gateway.bind',
  '$.gateway.auth.mode',
  '$.channels',
  '$.plugins.allow',
  '$.plugins.entries',
  '$.plugins.installs',
]

const HOT_RELOAD_PATH_PREFIXES = [
  '$.gateway.auth.token',
]

const HOT_RELOAD_ENV_KEY_PATTERN = /(TOKEN|API_KEY|AUTH|SECRET)/i

function normalizePathList(paths: string[]): string[] {
  return [...new Set((paths || []).map((path) => String(path || '').trim()).filter(Boolean))]
}

function normalizeEnvKeyList(keys: string[] | undefined): string[] {
  return [...new Set((keys || []).map((key) => String(key || '').trim()).filter(Boolean))]
}

function isPathMatched(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)
}

export function resolveGatewayApplyAction(changeSet: GatewayApplyChangeSet): GatewayApplyDecision {
  const changedJsonPaths = normalizePathList(changeSet.changedJsonPaths)
  const changedEnvKeys = normalizeEnvKeyList(changeSet.changedEnvKeys)

  const restartMatched = changedJsonPaths.filter((path) =>
    RESTART_PATH_PREFIXES.some((prefix) => isPathMatched(path, prefix))
  )
  if (restartMatched.length > 0) {
    return {
      action: 'restart',
      reason: 'matched-runtime-topology-paths',
      matched: restartMatched,
    }
  }

  const hotReloadPathMatched = changedJsonPaths.filter((path) =>
    HOT_RELOAD_PATH_PREFIXES.some((prefix) => isPathMatched(path, prefix))
  )
  const hotReloadEnvMatched = changedEnvKeys.filter((key) => HOT_RELOAD_ENV_KEY_PATTERN.test(key))
  const hotReloadMatched = [...hotReloadPathMatched, ...hotReloadEnvMatched.map((key) => `env:${key}`)]
  if (hotReloadMatched.length > 0) {
    return {
      action: 'hot-reload',
      reason: 'matched-secrets-paths',
      matched: hotReloadMatched,
    }
  }

  return {
    action: 'none',
    reason: 'non-runtime-config-change',
    matched: [],
  }
}

