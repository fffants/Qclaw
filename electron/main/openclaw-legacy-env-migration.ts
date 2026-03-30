type OpenClawCanonicalEnvKey =
  | 'OPENCLAW_STATE_DIR'
  | 'OPENCLAW_CONFIG_PATH'
  | 'OPENCLAW_GATEWAY_URL'
  | 'OPENCLAW_GATEWAY_TOKEN'

type EnvRecord = Record<string, string | undefined>

type LegacyEnvMode = 'steady-state' | 'migration'

interface OpenClawLegacyEnvResolutionOptions {
  mode?: LegacyEnvMode
  onWarning?: (warning: string) => void
}

interface OpenClawLegacyEnvResolution {
  canonicalKey: OpenClawCanonicalEnvKey
  value?: string
  source: 'canonical' | 'legacy' | 'missing'
  legacyKey?: string
}

const LEGACY_OPENCLAW_ENV_ALIASES: Record<OpenClawCanonicalEnvKey, string[]> = {
  OPENCLAW_STATE_DIR: ['CLAWDBOT_STATE_DIR', 'MOLTBOT_STATE_DIR'],
  OPENCLAW_CONFIG_PATH: ['CLAWDBOT_CONFIG_PATH', 'MOLTBOT_CONFIG_PATH'],
  OPENCLAW_GATEWAY_URL: ['CLAWDBOT_GATEWAY_URL', 'MOLTBOT_GATEWAY_URL'],
  OPENCLAW_GATEWAY_TOKEN: ['CLAWDBOT_GATEWAY_TOKEN', 'MOLTBOT_GATEWAY_TOKEN'],
}

const emittedWarnings = new Set<string>()

function normalizeEnvValue(value: unknown): string | undefined {
  const normalized = String(value || '').trim()
  return normalized || undefined
}

function emitWarningOnce(message: string, onWarning?: (warning: string) => void): void {
  if (!message || emittedWarnings.has(message)) return
  emittedWarnings.add(message)
  ;(onWarning ?? ((warning) => console.warn(warning)))(message)
}

function buildLegacyAliasWarning(
  mode: LegacyEnvMode,
  legacyKey: string,
  canonicalKey: OpenClawCanonicalEnvKey
): string {
  if (mode === 'migration') {
    return `[openclaw] Detected removed legacy env alias ${legacyKey}; migrating it to ${canonicalKey} for this compatibility path only. Set ${canonicalKey} explicitly.`
  }

  return `[openclaw] Ignoring removed legacy env alias ${legacyKey}; steady-state now reads ${canonicalKey} only.`
}

export function resolveOpenClawEnvValue(
  env: EnvRecord,
  canonicalKey: OpenClawCanonicalEnvKey,
  options: OpenClawLegacyEnvResolutionOptions = {}
): OpenClawLegacyEnvResolution {
  const mode = options.mode ?? 'steady-state'
  const canonicalValue = normalizeEnvValue(env[canonicalKey])
  if (canonicalValue) {
    return {
      canonicalKey,
      value: canonicalValue,
      source: 'canonical',
    }
  }

  for (const legacyKey of LEGACY_OPENCLAW_ENV_ALIASES[canonicalKey]) {
    const legacyValue = normalizeEnvValue(env[legacyKey])
    if (!legacyValue) continue

    emitWarningOnce(buildLegacyAliasWarning(mode, legacyKey, canonicalKey), options.onWarning)
    return {
      canonicalKey,
      value: mode === 'migration' ? legacyValue : undefined,
      source: mode === 'migration' ? 'legacy' : 'missing',
      legacyKey,
    }
  }

  return {
    canonicalKey,
    source: 'missing',
  }
}

export function buildOpenClawLegacyEnvPatch(
  env: EnvRecord,
  options: OpenClawLegacyEnvResolutionOptions = {}
): Partial<NodeJS.ProcessEnv> {
  const mode = options.mode ?? 'steady-state'
  const patch: Partial<NodeJS.ProcessEnv> = {}

  for (const canonicalKey of Object.keys(LEGACY_OPENCLAW_ENV_ALIASES) as OpenClawCanonicalEnvKey[]) {
    const resolution = resolveOpenClawEnvValue(env, canonicalKey, options)
    if (mode === 'migration' && resolution.source === 'legacy' && resolution.value) {
      patch[canonicalKey] = resolution.value
    }

    for (const legacyKey of LEGACY_OPENCLAW_ENV_ALIASES[canonicalKey]) {
      patch[legacyKey] = undefined
    }
  }

  return patch
}

export function resetOpenClawLegacyEnvWarningsForTests(): void {
  emittedWarnings.clear()
}
