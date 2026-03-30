function normalizeProviderId(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function normalizeModelList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
}

function isConfiguredAuthProvider(entry: any): boolean {
  const status = String(entry?.status || '').trim().toLowerCase()
  if (status && status !== 'missing' && status !== 'none' && status !== 'error') return true
  if (entry?.authenticated === true) return true
  if (entry?.effective || entry?.modelsJson || entry?.env) return true
  if ((entry?.profiles?.count || 0) > 0) return true
  return false
}

export function isProviderConfiguredInStatus(
  statusData: Record<string, any> | null | undefined,
  providerKey: string
): boolean {
  const targetProviderId = normalizeProviderId(providerKey)
  if (!targetProviderId) return false

  const authProviders = Array.isArray(statusData?.auth?.providers) ? statusData?.auth?.providers : []
  for (const entry of authProviders) {
    const providerId = normalizeProviderId(entry?.provider ?? entry?.providerId)
    if (providerId === targetProviderId && isConfiguredAuthProvider(entry)) {
      return true
    }
  }

  const oauthProviders = Array.isArray(statusData?.auth?.oauth?.providers) ? statusData?.auth?.oauth?.providers : []
  for (const entry of oauthProviders) {
    const providerId = normalizeProviderId(entry?.provider ?? entry?.providerId)
    const status = String(entry?.status || '').trim().toLowerCase()
    if (providerId === targetProviderId && status && status !== 'missing' && status !== 'none' && status !== 'error') {
      return true
    }
  }

  for (const modelKey of normalizeModelList(statusData?.allowed)) {
    const providerId = normalizeProviderId(modelKey.split('/')[0])
    if (providerId === targetProviderId) {
      return true
    }
  }

  return false
}
