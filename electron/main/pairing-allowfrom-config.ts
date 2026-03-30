export interface PairingAllowFromNormalizeOptions {
  preserveWildcard?: boolean
}

export interface PairingAllowFromMutationResult {
  changed: boolean
  targetMissing: boolean
}

export type PairingAllowFromMutationMode = 'add' | 'remove'

export type PairingSenderNormalizer = (channel: string, senderId: string) => string | null

export function normalizePairingAllowFromList(
  channel: string,
  value: unknown,
  normalizeSenderId: PairingSenderNormalizer,
  options: PairingAllowFromNormalizeOptions = {}
): string[] {
  if (!Array.isArray(value)) return []
  const users = new Set<string>()
  for (const item of value) {
    const raw = String(item || '').trim()
    if (!raw) continue
    if (options.preserveWildcard && raw === '*') {
      users.add('*')
      continue
    }
    const normalized = normalizeSenderId(channel, raw)
    if (normalized) users.add(normalized)
  }
  return Array.from(users)
}

export function resolvePairingConfigTarget(
  config: Record<string, any> | null,
  channel: string,
  accountId?: string
): Record<string, any> | null {
  if (!config || typeof config !== 'object') return null
  const channels = config.channels as Record<string, any> | undefined
  if (!channels || typeof channels !== 'object') return null

  const normalizedChannel = String(channel || '').trim().toLowerCase()
  const channelConfig = channels[normalizedChannel]
  if (!channelConfig || typeof channelConfig !== 'object' || Array.isArray(channelConfig)) {
    return null
  }

  if (normalizedChannel !== 'feishu') {
    return channelConfig
  }

  const normalizedAccountId = String(accountId || 'default').trim() || 'default'
  if (normalizedAccountId === 'default') {
    return channelConfig
  }

  const accounts = channelConfig.accounts as Record<string, any> | undefined
  const accountConfig = accounts?.[normalizedAccountId]
  if (!accountConfig || typeof accountConfig !== 'object' || Array.isArray(accountConfig)) {
    return null
  }

  return accountConfig
}

export function mutatePairingAllowFromInConfig(
  config: Record<string, any> | null,
  channel: string,
  senderId: string,
  mode: PairingAllowFromMutationMode,
  options: {
    accountId?: string
    normalizeSenderId: PairingSenderNormalizer
  }
): PairingAllowFromMutationResult {
  const normalizedChannel = String(channel || '').trim().toLowerCase()
  const target = resolvePairingConfigTarget(config, normalizedChannel, options.accountId)
  if (!target) {
    return {
      changed: false,
      targetMissing: true,
    }
  }

  const current = normalizePairingAllowFromList(
    normalizedChannel,
    target.allowFrom,
    options.normalizeSenderId,
    { preserveWildcard: true }
  )

  const currentSet = new Set(current)
  if (mode === 'add') {
    currentSet.add(senderId)
  } else {
    currentSet.delete(senderId)
  }

  const next = Array.from(currentSet)
  const changed = next.length !== current.length || next.some((item, index) => item !== current[index])
  if (!changed) {
    return {
      changed: false,
      targetMissing: false,
    }
  }

  target.allowFrom = next
  return {
    changed: true,
    targetMissing: false,
  }
}

