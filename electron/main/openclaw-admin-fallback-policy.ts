function isPathInsideHome(value: string, userHome: string): boolean {
  const normalizedValue = String(value || '').trim()
  const normalizedHome = String(userHome || '').trim()
  if (!normalizedValue || !normalizedHome) return false
  return normalizedValue === normalizedHome || normalizedValue.startsWith(`${normalizedHome}/`)
}

const MAC_SYSTEM_GLOBAL_PREFIXES = ['/usr/local', '/opt/homebrew']

export function isMacSystemGlobalOpenClawPrefix(
  prefixPath: string,
  userHome = process.env.HOME || ''
): boolean {
  const normalizedPrefix = String(prefixPath || '').trim()
  const normalizedHome = String(userHome || '').trim()
  if (!normalizedPrefix) return false
  if (normalizedHome && isPathInsideHome(normalizedPrefix, normalizedHome)) return false
  return MAC_SYSTEM_GLOBAL_PREFIXES.some((prefix) => (
    normalizedPrefix === prefix || normalizedPrefix.startsWith(`${prefix}/`)
  ))
}

export function isMacOpenClawAdminFallbackEnabledByPolicy(
  raw = process.env.QCLAW_MAC_OPENCLAW_ADMIN_FALLBACK
): boolean {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function shouldPreferMacOpenClawAdminMainlineByProbe(options: {
  prefixResolved: boolean
  prefixPath?: string | null
  userHome?: string | null
}): boolean {
  if (!options.prefixResolved) return true
  const prefixPath = String(options.prefixPath || '').trim()
  const userHome = String(options.userHome || process.env.HOME || '').trim()
  return isMacSystemGlobalOpenClawPrefix(prefixPath, userHome)
}

export function shouldAllowMacOpenClawAdminFallbackByProbe(options: {
  policyEnabled: boolean
  prefixResolved: boolean
  writable: boolean
  ownerMatchesCurrentUser: boolean | null
  prefixPath?: string | null
  userHome?: string | null
}): boolean {
  if (!options.prefixResolved) return false
  const permissionIssue = !options.writable || options.ownerMatchesCurrentUser === false
  if (!permissionIssue) return false

  const prefixPath = String(options.prefixPath || '').trim()
  const userHome = String(options.userHome || process.env.HOME || '').trim()
  if (isMacSystemGlobalOpenClawPrefix(prefixPath, userHome)) {
    return true
  }
  if (prefixPath && userHome && isPathInsideHome(prefixPath, userHome)) {
    return options.policyEnabled
  }

  if (options.policyEnabled) return true
  return false
}
